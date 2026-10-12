# 도성학원 공식 웹사이트 - 정적 파일을 nginx로 서빙 (Google Cloud Run용)
FROM nginx:1.27-alpine

# Cloud Run은 PORT 환경변수(기본 8080)로 요청을 전달함
ENV PORT=8080

COPY nginx.conf /etc/nginx/templates/default.conf.template
COPY --chown=nginx:nginx . /usr/share/nginx/html

# 캐시 무효화: CSS/JS는 브라우저에 1일 캐시되므로 빌드마다 ?v=버전 을 붙여 새 파일을 받게 함
# (GitHub Actions는 커밋 SHA를 넘기고, 수동 빌드는 빌드 시각을 사용)
ARG ASSET_VERSION=""
RUN V="${ASSET_VERSION:-$(date +%Y%m%d%H%M%S)}" \
    && sed -i -e "s|href=\"styles.css\"|href=\"styles.css?v=${V}\"|g" \
              -e "s|src=\"script.js\"|src=\"script.js?v=${V}\"|g" \
       /usr/share/nginx/html/*.html \
    && echo "asset version: ${V}"

EXPOSE 8080
