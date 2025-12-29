# Contributing to Surfi

Thank you for your interest in contributing to Surfi! We welcome contributions from the community.

## How to Contribute

### Reporting Bugs

Before creating bug reports, please check the existing issues to avoid duplicates. When creating a bug report, include:

- **Clear title and description**
- **Steps to reproduce** the issue
- **Expected behavior** vs actual behavior
- **Screenshots** if applicable
- **Browser version** and OS
- **Extension version**

### Suggesting Enhancements

Enhancement suggestions are tracked as GitHub issues. When creating an enhancement suggestion, include:

- **Clear title and description**
- **Use case** - why would this be useful?
- **Proposed solution** if you have one
- **Alternative solutions** you've considered

### Pull Requests

1. **Fork the repository** and create your branch from `main`
2. **Install dependencies**: `npm install`
3. **Make your changes** following our coding standards
4. **Test your changes**: `npm run build` and load the extension in Chrome
5. **Commit your changes** with clear, descriptive commit messages
6. **Push to your fork** and submit a pull request

#### Pull Request Guidelines

- Follow the existing code style
- Write clear commit messages
- Update documentation if needed
- Test your changes thoroughly
- Keep PRs focused - one feature/fix per PR
- Link related issues in the PR description

### Development Setup

1. Clone your fork:
   ```bash
   git clone https://github.com/YOUR-USERNAME/Surfi.git
   cd Surfi
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Build the extension:
   ```bash
   npm run build
   ```

4. Load in Chrome:
   - Open `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the `dist` folder

### Code Style

- Use TypeScript for type safety
- Follow existing formatting conventions
- Use meaningful variable and function names
- Add comments for complex logic
- Keep functions small and focused

### Testing

Before submitting a PR:
- Build the extension successfully
- Test all affected functionality
- Test in Chrome browser
- Verify no console errors

## Code of Conduct

This project follows a Code of Conduct. By participating, you are expected to uphold this code.

## Questions?

Feel free to open an issue for questions or reach out to the maintainers.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
