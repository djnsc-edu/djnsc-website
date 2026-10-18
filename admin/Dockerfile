# 도성학원 관리자 페이지 (Node.js) — nginx 컨테이너 옆에서 사이드카로 실행, nginx가 /admin 을 127.0.0.1:3000 으로 프록시
FROM node:20-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY server.js ./
COPY lib ./lib
COPY public ./public
USER node
ENV ADMIN_PORT=3000
EXPOSE 3000
CMD ["node", "server.js"]
