// @ts-check
import { defineConfig } from 'astro/config';
import preact from '@astrojs/preact';

const repository = process.env.GITHUB_REPOSITORY?.split('/')[1] ?? 'ferik_trading_journal';
const owner = process.env.GITHUB_REPOSITORY?.split('/')[0];
const isGitHubPages = Boolean(process.env.GITHUB_ACTIONS && owner && process.env.PLAYWRIGHT_TEST !== 'true');

// https://astro.build/config
export default defineConfig({
	output: 'static',
	integrations: [preact()],
	site: isGitHubPages ? `https://${owner}.github.io` : 'http://localhost:4321',
	base: isGitHubPages ? `/${repository}/` : '/',
});
