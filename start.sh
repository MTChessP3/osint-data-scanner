#!/bin/bash
# Railway.app Start Script - OSINT Data Scanner
set -e

APP_DIR="${APP_ROOT:-/home/z/my-project}"
echo "=== OSINT Data Scanner - Starting ==="
echo "App directory: $APP_DIR"

# Ensure directories exist
mkdir -p "$APP_DIR/download/reports"
mkdir -p "$APP_DIR/upload"
mkdir -p "$APP_DIR/db"

# Install Python dependencies
echo "Installing Python dependencies..."
pip install python-docx openpyxl --break-system-packages 2>/dev/null || true

# Copy template to upload directory if not present
if [ ! -f "$APP_DIR/upload/Plantilla_de_Informes.docx" ]; then
    echo "Looking for template..."
    if [ -f "$APP_DIR/Plantilla_de_Informes.docx" ]; then
        cp "$APP_DIR/Plantilla_de_Informes.docx" "$APP_DIR/upload/"
        echo "Template copied to upload directory."
    else
        echo "WARNING: Template not found. Report generation will fail."
    fi
else
    echo "Template found in upload directory."
fi

# Generate Prisma client
echo "Generating Prisma client..."
npx prisma generate

# Push database schema
echo "Setting up database..."
npx prisma db push

# Start the Next.js server
echo "=== Starting Next.js Server ==="
exec node .next/standalone/server.js
