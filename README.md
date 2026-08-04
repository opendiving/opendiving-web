# OpenDiving Web

A modern web application for the diving community built with Next.js, React, Tailwind CSS, and shadcn/ui.

## Features

- 🤿 **Dive Logging**: Track your underwater adventures with detailed dive logs
- 🌊 **Community**: Connect with divers worldwide and share experiences
- 📍 **Dive Sites**: Discover and explore dive sites around the globe
- 📊 **Dashboard**: Personal diving statistics and recent activity
- 🎨 **Modern UI**: Built with shadcn/ui components and Tailwind CSS
- 📱 **Responsive**: Optimized for desktop, tablet, and mobile devices
- 🔒 **Type Safe**: Full TypeScript support throughout the application

## Tech Stack

- **Framework**: [Next.js 14](https://nextjs.org/) with App Router
- **Language**: [TypeScript](https://www.typescriptlang.org/)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/)
- **UI Components**: [shadcn/ui](https://ui.shadcn.com/)
- **Icons**: [Lucide React](https://lucide.dev/)
- **Linting**: [ESLint](https://eslint.org/)

## Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** (version 18 or higher)
- **npm** or **yarn** package manager

## Getting Started

1. **Clone the repository** (if not already done):
   ```bash
   git clone <repository-url>
   cd opendiving/opendiving-web
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Run the development server**:
   ```bash
   npm run dev
   ```

4. **Open your browser** and navigate to [http://localhost:3000](http://localhost:3000)

## Available Scripts

- `npm run dev` - Start the development server
- `npm run build` - Build the application for production
- `npm run start` - Start the production server
- `npm run lint` - Run ESLint to check for code issues
- `npm run type-check` - Run TypeScript type checking
- `npm run test` - Run the unit test suite once
- `npm run test:watch` - Run the unit test suite in watch mode
- `npm run test:coverage` - Run the unit test suite with a coverage report

## Project Structure

```
src/
├── app/                    # Next.js App Router pages
│   ├── dashboard/         # Dashboard page
│   ├── globals.css        # Global styles and Tailwind imports
│   ├── layout.tsx         # Root layout component
│   └── page.tsx           # Homepage
├── components/            # React components
│   ├── layout/           # Layout components (Header, Footer, etc.)
│   └── ui/               # shadcn/ui components
└── lib/                  # Utility functions
    └── utils.ts          # Class name utilities for Tailwind
```

## Adding New Components

To add new shadcn/ui components, you can use the CLI:

```bash
npx shadcn-ui@latest add [component-name]
```

For example:
```bash
npx shadcn-ui@latest add dialog
npx shadcn-ui@latest add dropdown-menu
npx shadcn-ui@latest add form
```

## Customization

### Tailwind Configuration

The Tailwind configuration is located in `tailwind.config.ts`. You can customize colors, spacing, and other design tokens here.

### shadcn/ui Configuration

The shadcn/ui configuration is in `components.json`. This controls the component installation path and styling preferences.

### Theme Colors

CSS custom properties for theming are defined in `src/app/globals.css`. You can modify these to change the application's color scheme.

## Pages Overview

### Homepage (`/`)
- Landing page with hero section
- Features overview
- Community statistics
- Call-to-action sections

### Dashboard (`/dashboard`)
- Personal diving statistics
- Recent dive activity
- Quick actions
- Upcoming dive plans

## Deployment

### Build for Production

```bash
npm run build
```

### Deploy to Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme):

1. Push your code to a Git repository
2. Connect your repository to Vercel
3. Vercel will automatically deploy your application

### Deploy to Other Platforms

This Next.js application can be deployed to various platforms:

- **Netlify**: Use the Next.js build output
- **AWS Amplify**: Configure build settings for Next.js
- **Docker**: Create a Dockerfile for containerized deployment

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## Code Style

This project uses:

- **ESLint** for code linting
- **TypeScript** for type safety
- **Prettier** integration through ESLint
- **Tailwind CSS** for consistent styling

Make sure to run `npm run lint` before submitting changes.

## License

This project is open source and available under the [MIT License](LICENSE).

## Support

For support and questions:

- Open an issue in the repository
- Join our community discussions
- Check the documentation

## Roadmap

- [ ] User authentication system
- [ ] Dive log CRUD operations  
- [ ] Photo upload and gallery
- [ ] Social features and following
- [ ] Dive site database integration
- [ ] Mobile app companion
- [ ] Offline support
- [ ] Advanced dive analytics
- [ ] Equipment tracking
- [ ] Certification management

---

Built with ❤️ for the diving community