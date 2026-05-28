FROM node:22-slim AS base
WORKDIR /app

# Install dependencies
COPY package.json package-lock.json ./
RUN npm ci

# Copy source
COPY . .

# Build (skip prisma generate - not used in this project)
RUN npm run build

# Expose port
EXPOSE 3000

# Start
CMD ["npm", "run", "start"]
