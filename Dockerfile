# Static prototype served by nginx. Railway injects $PORT; nginx's template mechanism fills it in.
FROM nginx:1.27-alpine
COPY deploy/default.conf.template /etc/nginx/templates/default.conf.template
COPY index.html styles.css journeys.js guide.js assistant.js app.js SPEC.md README.md /usr/share/nginx/html/
ENV PORT=8080
EXPOSE 8080
