# Contributing to Trace Dock

First off, thank you for considering contributing to Trace Dock! 🎉

It's people like you that make Trace Dock such a great tool for the community. This document provides guidelines and steps for contributing.

## 📋 Table of Contents

- [Code of Conduct](#code-of-conduct)
- [How Can I Contribute?](#how-can-i-contribute)
- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Development Workflow](#development-workflow)
- [Coding Guidelines](#coding-guidelines)
- [Testing Guidelines](#testing-guidelines)
- [Commit Messages](#commit-messages)
- [Pull Request Process](#pull-request-process)

## 📜 Code of Conduct

This project and everyone participating in it is governed by our commitment to providing a welcoming and inclusive environment. Please be respectful and constructive in all interactions.

## 🤝 How Can I Contribute?

### Reporting Bugs

Before creating bug reports, please check existing issues to avoid duplicates. When you create a bug report, include as many details as possible using our [bug report template](.github/ISSUE_TEMPLATE/bug_report.md).

### Suggesting Features

Feature suggestions are welcome! Please use our [feature request template](.github/ISSUE_TEMPLATE/feature_request.md) to submit your ideas.

### Code Contributions

1. Look for issues labeled `good first issue` or `help wanted`
2. Comment on the issue to let others know you're working on it
3. Fork the repository and create your branch
4. Submit a pull request

### Documentation

Improvements to documentation are always welcome! This includes:
- README updates
- Code comments
- API documentation
- Usage examples

## 🛠️ Development Setup

### Prerequisites

- **Node.js**: 20.x or higher
- **pnpm**: 8.x or higher
- **Git**: For version control

### Getting Started

```bash
# 1. Fork the repository on GitHub

# 2. Clone your fork
git clone https://github.com/YOUR_USERNAME/trace-dock.git
cd trace-dock

# 3. Add the upstream remote
git remote add upstream https://github.com/JeepayJipex/trace-dock.git

# 4. Install dependencies
pnpm install

# 5. Start development servers
pnpm dev
```

### Running Individual Components

```bash
# SDK only
cd packages/sdk && pnpm dev

# Server only
pnpm dev:server

# Web UI only
pnpm dev:web
```

## 📁 Project Structure

```
trace-dock/
├── packages/
│   └── sdk/              # TypeScript SDK
│       ├── src/          # Source code
│       └── dist/         # Built output
├── server/               # Hono API server
│   ├── src/              # Source code
│   │   ├── db/           # Database layer
│   │   └── ...
│   └── drizzle/          # Database migrations
├── web/                  # Vue 3 + Vite frontend
│   ├── src/
│   │   ├── components/   # Vue components
│   │   ├── composables/  # Vue composables
│   │   ├── views/        # Page views
│   │   └── api/          # API client
│   └── public/           # Static assets
└── docker-compose.yml    # Docker configuration
```

## 🔄 Development Workflow

### 1. Create a Branch

```bash
# Update your main branch
git checkout main
git pull upstream main

# Create a feature branch
git checkout -b feature/your-feature-name

# Or for bug fixes
git checkout -b fix/issue-description
```

### 2. Make Your Changes

- Write clean, readable code
- Add tests for new functionality
- Update documentation as needed

### 3. Test Your Changes

```bash
# Run all tests
pnpm test:run

# Run specific package tests
pnpm test:sdk
pnpm test:server
pnpm test:web

# Run tests in watch mode
pnpm test
```

### 4. Commit Your Changes

Follow our [commit message guidelines](#commit-messages).

### 5. Push and Create a PR

```bash
git push origin feature/your-feature-name
```

Then create a Pull Request on GitHub.

## 📝 Coding Guidelines

### TypeScript

- Use TypeScript for all new code
- Define proper types and interfaces
- Avoid using `any` type
- Use meaningful variable and function names

### Code Style

- Use 2 spaces for indentation
- Use single quotes for strings
- Add trailing commas in multiline arrays/objects
- Keep lines under 100 characters when possible

### File Naming

- Use `kebab-case` for file names: `my-component.ts`
- Use `.test.ts` suffix for test files: `logger.test.ts`
- Use `.vue` extension for Vue components

### SDK Guidelines

```typescript
// Good: Clear function signatures with types
export function createLogger(options: LoggerOptions): Logger {
  // ...
}

// Good: Proper error handling
try {
  await transport.send(logs);
} catch (error) {
  options.onError?.(error as Error);
}
```

### Server Guidelines

```typescript
// Good: Use Hono's built-in types
app.get('/logs', async (c) => {
  const query = c.req.query();
  // ...
  return c.json(result);
});
```

### Vue/Web Guidelines

```vue
<!-- Good: Use Composition API with script setup -->
<script setup lang="ts">
import { ref, computed } from 'vue';

const props = defineProps<{
  title: string;
}>();

const count = ref(0);
</script>
```

## 🧪 Testing Guidelines

### Writing Tests

- Write tests for all new features
- Update tests when modifying existing functionality
- Aim for good coverage of edge cases

### Test Structure

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

describe('MyFeature', () => {
  beforeEach(() => {
    // Setup
  });

  afterEach(() => {
    // Cleanup
  });

  it('should do something specific', () => {
    // Arrange
    const input = 'test';
    
    // Act
    const result = myFunction(input);
    
    // Assert
    expect(result).toBe('expected');
  });
});
```

### Running Tests

```bash
# All tests
pnpm test:run

# With coverage
pnpm test:run -- --coverage

# Specific file
pnpm test:run -- path/to/file.test.ts
```

## 💬 Commit Messages

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

### Types

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

### Scopes

- `sdk`: Changes to the SDK package
- `server`: Changes to the server
- `web`: Changes to the web UI
- `docker`: Changes to Docker configuration
- `deps`: Dependency updates

### Examples

```bash
feat(sdk): add support for custom transports

fix(server): resolve memory leak in WebSocket connections

docs(readme): update installation instructions

test(sdk): add tests for batch processing
```

## 🔀 Pull Request Process

1. **Update your branch** with the latest changes from main:
   ```bash
   git fetch upstream
   git rebase upstream/main
   ```

2. **Ensure all tests pass**:
   ```bash
   pnpm test:run
   ```

3. **Fill out the PR template** completely

4. **Request a review** from maintainers

5. **Address feedback** promptly and push updates

6. **Squash commits** if requested before merging

### PR Review Criteria

- [ ] Code follows project guidelines
- [ ] Tests are included and passing
- [ ] Documentation is updated
- [ ] No breaking changes (or properly documented)
- [ ] Commit messages follow conventions

## 🎉 Recognition

Contributors will be recognized in:
- The project README
- Release notes for features/fixes they contributed

Thank you for contributing to Trace Dock! 🚀
