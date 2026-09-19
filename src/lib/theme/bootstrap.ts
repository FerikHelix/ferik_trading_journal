import { DARK_META, LIGHT_META, THEME_STORAGE_KEY } from './index';

/**
 * Dependency-free snippet injected with <script is:inline set:html>. It runs
 * before first paint to avoid a flash of the wrong theme, so it cannot import
 * anything. The try/catch matters: reading localStorage throws outright in
 * some privacy modes, and an uncaught throw here would block rendering.
 */
export function themeBootstrap(): string {
  return `(()=>{try{` +
    `var k=${JSON.stringify(THEME_STORAGE_KEY)},s=localStorage.getItem(k),` +
    `p=(s==='light'||s==='dark'||s==='system')?s:'system',` +
    `t=p==='system'?(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):p,` +
    `d=document.documentElement;` +
    `d.dataset.theme=t;d.style.colorScheme=t;` +
    `var m=document.querySelector('meta[name="theme-color"]');` +
    `if(m)m.setAttribute('content',t==='dark'?${JSON.stringify(DARK_META)}:${JSON.stringify(LIGHT_META)});` +
    `}catch(e){}})();`;
}
