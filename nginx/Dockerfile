FROM nginx

COPY certs/cert.pem /etc/nginx/
COPY certs/key.pem /etc/nginx/

RUN rm /etc/nginx/conf.d/default.conf
COPY nginx.conf /etc/nginx/conf.d/default.conf