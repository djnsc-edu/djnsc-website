# 도성학원 공식 웹사이트 배포 가이드 (Google Cloud Run)

정적 사이트(HTML/CSS/JS)를 nginx 컨테이너로 묶어 **Google Cloud Run(서울 리전)** 에 배포합니다.
`main` 브랜치에 push 하면 GitHub Actions가 자동으로 빌드·배포합니다.

- 저장소: `djnsc-edu/djnsc-website`
- 서비스 도메인: `https://djnsc.com`
- 구성 파일: `Dockerfile`, `nginx.conf`, `.github/workflows/deploy.yml`

---

## 1. Google Cloud 최초 설정 (한 번만)

로컬에 [gcloud CLI](https://cloud.google.com/sdk/docs/install)를 설치하고 로그인한 뒤 실행합니다.
`PROJECT_ID`는 실제 GCP 프로젝트 ID로 바꾸세요.

```bash
export PROJECT_ID=your-gcp-project-id
export REGION=asia-northeast3
gcloud config set project $PROJECT_ID

# 필요한 API 활성화
gcloud services enable run.googleapis.com artifactregistry.googleapis.com \
  iamcredentials.googleapis.com cloudbuild.googleapis.com

# 컨테이너 이미지 저장소
gcloud artifacts repositories create djnsc-website \
  --repository-format=docker --location=$REGION
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
# 도메인 소유 확인(Search Console)이 끝난 뒤
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
```

## 6. 수동 배포 (GitHub Actions 없이)

```bash
gcloud run deploy djnsc-website --source . --region=$REGION --allow-unauthenticated
```

## 배포 후 체크리스트

- [ ] `index.html`의 `naver-site-verification` / `google-site-verification` 메타 태그 주석 해제 및 코드 입력
- [ ] 네이버 서치어드바이저·구글 서치콘솔에 `https://djnsc.com/sitemap.xml` 제출
- [ ] 카카오·네이버 공유 미리보기(og:image) 캐시 갱신
