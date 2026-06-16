FROM node:20-alpine

RUN apk add --no-cache curl

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build && npm prune --production

# Create data directories
RUN mkdir -p data uploads outputs

EXPOSE 4000

CMD ["npm", "start"]
