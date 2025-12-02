# Security Policy

## 🔒 Reporting a Vulnerability

We take the security of Trace Dock seriously. If you discover a security vulnerability, please report it responsibly.

### How to Report

**Please do NOT report security vulnerabilities through public GitHub issues.**

Instead, please report them via email to the maintainers or use GitHub's private vulnerability reporting feature.

### What to Include

When reporting a vulnerability, please include:

1. **Description**: A clear description of the vulnerability
2. **Steps to Reproduce**: Detailed steps to reproduce the issue
3. **Impact**: The potential impact of the vulnerability
4. **Affected Versions**: Which versions are affected
5. **Suggested Fix**: If you have a suggestion for how to fix it

### Response Timeline

- **Acknowledgment**: Within 48 hours
- **Initial Assessment**: Within 1 week
- **Resolution Target**: Within 30 days (depending on severity)

## 🛡️ Security Best Practices

When deploying Trace Dock in production:

### Server Configuration

1. **Use HTTPS**: Always deploy behind a reverse proxy with TLS
2. **CORS Configuration**: Set `CORS_ORIGINS` to specific allowed origins, avoid `CORS_ALLOW_ALL=true` in production
3. **Network Isolation**: Consider deploying in a private network

### Database Security

1. **Strong Passwords**: Use strong passwords for PostgreSQL/MySQL
2. **Access Control**: Limit database access to the server only
3. **Backups**: Regularly backup your database

### Docker Deployment

1. **Non-root User**: Containers run as non-root by default
2. **Read-only Filesystem**: Consider using read-only containers where possible
3. **Resource Limits**: Set appropriate CPU and memory limits

### Example Secure Docker Compose

```yaml
services:
  server:
    environment:
      - CORS_ORIGINS=https://yourdomain.com
    deploy:
      resources:
        limits:
          cpus: '1'
          memory: 512M
    read_only: true
    tmpfs:
      - /tmp
```

## 📋 Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| Latest  | :white_check_mark: |
| < 1.0   | :x:                |

## 🔐 Known Security Considerations

### Data Storage

- Logs may contain sensitive information
- Consider data retention policies
- Use encryption at rest for sensitive deployments

### WebSocket Connections

- WebSocket connections are authenticated by origin
- Consider additional authentication for sensitive environments

### API Access

- No built-in authentication (by design for self-hosted simplicity)
- Deploy behind a reverse proxy with authentication if needed
- Use network-level security (VPN, private network)

## 🙏 Thank You

We appreciate security researchers and community members who help keep Trace Dock secure!
