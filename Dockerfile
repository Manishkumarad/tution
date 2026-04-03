FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY backend/src ./backend/src
COPY backend/db ./backend/db
COPY backend/storage ./backend/storage
COPY README.md ./README.md

ENV NODE_ENV=production
EXPOSE 4000

CMD ["npm", "start"]
