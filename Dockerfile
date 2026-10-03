# 도성학원 공식 웹사이트 - 정적 파일을 nginx로 서빙 (Google Cloud Run용)
FROM nginx:1.27-alpine

# Cloud Run은 PORT 환경변수(기본 8080)로 요청을 전달함
ENV PORT=8080

COPY nginx.conf /etc/nginx/templates/default.conf.template
COPY --chown=nginx:nginx . /usr/share/nginx/html

EXPOSE 8080
