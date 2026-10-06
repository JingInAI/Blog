import type { AppConfig } from '@blog/contracts';
declare global {
  const __BLOG_CONFIG__: AppConfig;
  const __BUILD_ID__: string;
  const __FRAMEWORK__: 'vue' | 'react';
}
export {};
