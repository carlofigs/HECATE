import{s as d,r as s}from"./index-BksuCUv-.js";/**
 * @license lucide-react v0.469.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const x=d("Trash2",[["path",{d:"M3 6h18",key:"d0wm0j"}],["path",{d:"M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6",key:"4alrt4"}],["path",{d:"M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2",key:"v07s0e"}],["line",{x1:"10",x2:"10",y1:"11",y2:"17",key:"1uufr5"}],["line",{x1:"14",x2:"14",y1:"11",y2:"17",key:"xtxkd"}]]);function h(c){const[n,o]=s.useState(()=>{try{const e=localStorage.getItem(c);return e?new Set(JSON.parse(e)):new Set}catch{return new Set}}),t=s.useCallback(e=>{localStorage.setItem(c,JSON.stringify([...e]))},[c]),r=s.useCallback(e=>{o(l=>{const a=new Set(l);return a.has(e)?a.delete(e):a.add(e),t(a),a})},[t]),u=s.useCallback(e=>{const l=new Set(e);t(l),o(l)},[t]),p=s.useCallback(()=>{t(new Set),o(new Set)},[t]);return{isCollapsed:s.useCallback(e=>n.has(e),[n]),toggle:r,collapseAll:u,expandAll:p,collapsedCount:n.size}}export{x as T,h as u};
