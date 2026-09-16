FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/backend/package.json packages/backend/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/frontend/package.json packages/frontend/package.json

RUN npm ci --ignore-scripts

COPY packages/contracts/contracts packages/contracts/contracts
COPY packages/backend packages/backend

WORKDIR /app/packages/contracts
RUN npx hardhat compile

WORKDIR /app/packages/backend
RUN npm run build

FROM node:22-alpine AS runtime

WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/package.json /app/package.json
COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/packages/backend/node_modules /app/packages/backend/node_modules
COPY --from=build /app/packages/backend/package.json /app/packages/backend/package.json
COPY --from=build /app/packages/backend/dist /app/packages/backend/dist

WORKDIR /app/packages/backend
EXPOSE 3001

CMD ["node", "dist/index.js"]