FROM node:20-alpine AS build
WORKDIR /app
COPY package.json ./
RUN npm install
COPY . .
ARG VITE_API_URL=/api/v1
ARG VITE_CODE_GENERATOR_URL=/codegen
ARG VITE_GOOGLE_CLIENT_ID=
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_CODE_GENERATOR_URL=$VITE_CODE_GENERATOR_URL
ENV VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID
RUN npm run build

FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Сертификаты: берём из pwa/certs/, если они там есть;
# иначе генерируем самоподписанный, чтобы сборка не падала
COPY certs/ /tmp/certs-src/
ARG LAN_IP=127.0.0.1
RUN mkdir -p /etc/nginx/ssl && \
    if [ -f /tmp/certs-src/cert.pem ] && [ -f /tmp/certs-src/key.pem ]; then \
        cp /tmp/certs-src/cert.pem /etc/nginx/ssl/cert.pem && \
        cp /tmp/certs-src/key.pem /etc/nginx/ssl/key.pem && \
        echo "==> Using provided certificates from pwa/certs/"; \
    else \
        apk add --no-cache openssl >/dev/null 2>&1 || true; \
        openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
            -keyout /etc/nginx/ssl/key.pem \
            -out /etc/nginx/ssl/cert.pem \
            -subj "/CN=lab-inventory" \
            -addext "subjectAltName=DNS:localhost,IP:127.0.0.1,IP:${LAN_IP}" && \
        echo "==> Generated self-signed certificate (LAN_IP=${LAN_IP})"; \
    fi && \
    rm -rf /tmp/certs-src

COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80 443