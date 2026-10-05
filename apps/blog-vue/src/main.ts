import { createVueRenderer } from '@blog/renderer-vue';
import { mountBlog } from '../../shared/host.ts';
import '../../shared/style.css';
const dispose = mountBlog(createVueRenderer(), document.getElementById('app')!);
if (import.meta.hot) import.meta.hot.dispose(dispose);
