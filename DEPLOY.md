# 도성학원 공식 웹사이트 배포 가이드 (Google Cloud Run)

정적 사이트(HTML/CSS/JS)를 nginx 컨테이너로 묶어 **Google Cloud Run(도쿄 리전 asia-northeast1)** 에 배포합니다.
이미지는 서울 리전(asia-northeast3) Artifact Registry에 저장합니다. 서비스를 도쿄에 두는 이유: Cloud Run 도메인 매핑이 서울 리전을 지원하지 않음 (AFT 사이트와 동일 구성).
`main` 브랜치에 push 하면 GitHub Actions가 자동으로 빌드·배포합니다.

- 저장소: `djnsc-edu/djnsc-website`
- 서비스 도메인: `https://djnsc.com`
- 구성 파일: `Dockerfile`, `nginx.conf`, `admin/Dockerfile`, `service.yaml`(Cloud Run 서비스 스펙), `.github/workflows/deploy.yml`

---

## 1. Google Cloud 최초 설정 (한 번만)

로컬에 [gcloud CLI](https://cloud.google.com/sdk/docs/install)를 설치하고 로그인한 뒤 실행합니다.
`PROJECT_ID`는 실제 GCP 프로젝트 ID로 바꾸세요.

```bash
export PROJECT_ID=your-gcp-project-id
export REGION=asia-northeast1   # 서비스 리전(도쿄)
export AR_REGION=asia-northeast3 # 이미지 저장소 리전(서울)
gcloud config set project $PROJECT_ID

# 필요한 API 활성화
gcloud services enable run.googleapis.com artifactregistry.googleapis.com \
  iamcredentials.googleapis.com cloudbuild.googleapis.com

# 컨테이너 이미지 저장소
gcloud artifacts repositories create djnsc-website \
  --repository-format=docker --location=$AR_REGION
```

## 2. GitHub Actions용 서비스 계정 + Workload Identity Federation

키 파일 없이 GitHub Actions가 GCP에 인증하도록 설정합니다.

```bash
export PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format='value(projectNumber)')

# 배포용 서비스 계정
gcloud iam service-accounts create github-deployer --display-name="GitHub Actions deployer"
export SA_EMAIL=github-deployer@$PROJECT_ID.iam.gserviceaccount.com

for ROLE in roles/run.admin roles/artifactregistry.writer roles/iam.serviceAccountUser; do
  gcloud projects add-iam-policy-binding $PROJECT_ID --member="serviceAccount:$SA_EMAIL" --role=$ROLE
done

# Workload Identity Pool / Provider
gcloud iam workload-identity-pools create github --location=global --display-name="GitHub"
gcloud iam workload-identity-pools providers create-oidc github-provider \
  --location=global --workload-identity-pool=github \
  --issuer-uri="https://token.actions.githubusercontent.com" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository" \
  --attribute-condition="assertion.repository=='djnsc-edu/djnsc-website'"

# 이 저장소의 워크플로우만 서비스 계정을 사용할 수 있게 허용
gcloud iam service-accounts add-iam-policy-binding $SA_EMAIL \
  --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/github/attribute.repository/djnsc-edu/djnsc-website"

# GitHub Secrets에 넣을 값 출력
echo "GCP_PROJECT_ID  = $PROJECT_ID"
echo "GCP_SA_EMAIL    = $SA_EMAIL"
echo "GCP_WIF_PROVIDER= projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/github/providers/github-provider"
```

## 3. GitHub Secrets 등록

저장소 → Settings → Secrets and variables → Actions → New repository secret

| Secret 이름        | 값                                         |
| ------------------ | ------------------------------------------ |
| `GCP_PROJECT_ID`   | GCP 프로젝트 ID                            |
| `GCP_SA_EMAIL`     | `github-deployer@<PROJECT_ID>.iam.gserviceaccount.com` |
| `GCP_WIF_PROVIDER` | 위 스크립트가 출력한 `projects/.../providers/github-provider` |

등록 후 `main`에 push 하거나 Actions 탭에서 **Deploy to Google Cloud Run** 워크플로우를 수동 실행하면 배포됩니다.
배포가 끝나면 `https://djnsc-website-xxxxx-du.a.run.app` 형태의 임시 URL로 확인할 수 있습니다.

## 4. 커스텀 도메인 `djnsc.com` 연결

```bash
# 도메인 소유 확인(Search Console → 도메인 속성 → 가비아에 TXT 레코드)이 끝난 뒤
gcloud beta run domain-mappings create --service=djnsc-website --domain=djnsc.com --region=$REGION
gcloud beta run domain-mappings create --service=djnsc-website --domain=www.djnsc.com --region=$REGION
```

명령이 출력하는 DNS 레코드(A/AAAA 또는 CNAME)를 도메인 등록 업체(가비아, 후이즈 등)의 DNS 설정에 추가하세요.
SSL 인증서는 Cloud Run이 자동 발급·갱신합니다(DNS 반영 후 보통 15분~1시간).

> 트래픽이 많아지거나 CDN이 필요하면 Cloud Run 앞에 **외부 HTTPS 로드밸런서 + Cloud CDN**을 붙일 수 있습니다.

## 5. 로컬에서 미리 확인

```bash
docker build -t djnsc-website .
docker run --rm -p 8080:8080 djnsc-website
# → http://localhost:8080
# → http://localhost:8080/api/blog  (네이버 블로그 RSS 프록시 — <item>이 보이면 정상)
```

## 네이버 블로그 연동 (메인 페이지 "학원소식" 섹션)

- 메인 페이지의 학원소식 카드는 네이버 블로그 RSS(`https://rss.blog.naver.com/djnsc.xml`)를 읽어 그립니다.
- 네이버가 CORS 헤더를 주지 않으므로 nginx가 `/api/blog` 경로에서 RSS를 중계하며, 응답을 10분 캐시합니다 (`nginx.conf`).
- 블로그에 글을 올리면 최대 10분 안에 사이트에 반영됩니다. 별도 배포는 필요 없습니다.
- CSS/JS는 브라우저에 1일 캐시되므로 Dockerfile이 빌드 시 `styles.css?v=…`, `script.js?v=…` 로 버전을 붙여 배포 직후 새 파일을 받게 합니다.
- 노출 개수는 `script.js`의 `MAX_POSTS`(기본 6개)로 조정합니다. RSS가 내보내는 글 수는 네이버 블로그 관리 → 기본 설정 → RSS 설정에서 늘릴 수 있습니다.
- RSS를 못 가져오면 카드 대신 "네이버 블로그에서 보기" 안내가 표시됩니다.

## 6. 수동 배포 (GitHub Actions 없이)

서비스는 web(nginx) + admin(Node 사이드카) 2컨테이너 구성이며, 스펙은 `service.yaml`에 선언돼 있습니다.
워크플로우와 같은 방식으로 이미지를 빌드·푸시한 뒤 플레이스홀더를 치환해 `replace` 합니다.

```bash
AR=asia-northeast3-docker.pkg.dev/$PROJECT_ID/djnsc-website
SHA=$(git rev-parse HEAD)
docker build --build-arg ASSET_VERSION="${SHA:0:8}" -t "$AR/djnsc-website:$SHA" . && docker push "$AR/djnsc-website:$SHA"
docker build -t "$AR/djnsc-website-admin:$SHA" ./admin && docker push "$AR/djnsc-website-admin:$SHA"
sed -e "s|WEB_IMAGE_PLACEHOLDER|$AR/djnsc-website:$SHA|"     -e "s|ADMIN_IMAGE_PLACEHOLDER|$AR/djnsc-website-admin:$SHA|"     -e "s|COMMIT_SHA_PLACEHOLDER|$SHA|" service.yaml > /tmp/service.yaml
gcloud run services replace /tmp/service.yaml --region=$REGION   # --dry-run 을 붙이면 검증만
```

> `gcloud run deploy --container web ... --container admin ...` 방식은 쓰지 않습니다.
> 단일 컨테이너 시절 자동 명명된 기존 컨테이너(`djnsc-website-1`)가 이름이 달라 그대로 남고, 포트를 노출하는 컨테이너가 2개가 되어
> `Revision template should contain exactly one container with an exposed port` 오류로 실패합니다.

## 배포 후 체크리스트

- [ ] `index.html`의 `naver-site-verification` / `google-site-verification` 메타 태그 주석 해제 및 코드 입력
- [ ] 네이버 서치어드바이저·구글 서치콘솔에 `https://djnsc.com/sitemap.xml` 제출
- [ ] 카카오·네이버 공유 미리보기(og:image) 캐시 갱신

## 방문 통계 (Google Analytics 4)

- 측정 ID `G-LVNRBN3290`, 전 페이지 `<head>`의 gtag 스니펫으로 수집. 대시보드: https://analytics.google.com
- `script.js`에서 보내는 맞춤 이벤트: `reserve_open`(상담예약 창 열기), `generate_lead`(상담 신청 전송 성공), `phone_click`, `blog_click`, `outbound_click`
- 개인정보처리방침(`privacy.html`) 6항에 수집 항목·거부 방법을 고지함. 측정 ID를 바꾸면 7개 HTML과 이 문서를 함께 수정.
