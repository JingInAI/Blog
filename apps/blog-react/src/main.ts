import { createReactRenderer } from '@blog/renderer-react';
import { mountBlog } from '../../shared/host.ts';
import '../../shared/style.css';
const dispose = mountBlog(createReactRenderer(), document.getElementById('app')!);
if (import.meta.hot) import.meta.hot.dispose(dispose);
