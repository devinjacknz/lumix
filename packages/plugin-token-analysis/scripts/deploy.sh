#!/bin/bash

# 设置环境变量
export $(cat .env | xargs)

# 检查必要的环境变量
if [ -z "$API_KEY" ]; then
  echo "Error: API_KEY is not set"
  exit 1
fi

if [ -z "$GRAFANA_PASSWORD" ]; then
  echo "Error: GRAFANA_PASSWORD is not set"
  exit 1
fi

# 构建项目
echo "Building project..."
pnpm build

# 构建 Docker 镜像
echo "Building Docker images..."
docker-compose build

# 停止并删除旧容器
echo "Stopping old containers..."
docker-compose down

# 启动新容器
echo "Starting new containers..."
docker-compose up -d

# 等待服务启动
echo "Waiting for services to start..."
sleep 30

# 检查服务健康状态
echo "Checking service health..."
docker-compose ps

# 检查应用日志
echo "Checking application logs..."
docker-compose logs app --tail 100

# 执行数据库迁移
echo "Running database migrations..."
docker-compose exec app node dist/scripts/migrate.js

# 执行数据同步
echo "Running data synchronization..."
docker-compose exec app node dist/scripts/sync.js

# 检查监控系统
echo "Checking monitoring system..."
curl -f http://localhost:9090/-/healthy || exit 1
curl -f http://localhost:3001/api/health || exit 1

echo "Deployment completed successfully!" 