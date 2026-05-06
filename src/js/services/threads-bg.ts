/**
 * services/threads-bg.ts
 * Round 58e (CSP): tach tu inline <script id="threads-bg"> trong index.html
 *
 * WebGL animation hieu ung "threads" cho background cua login screen.
 * Su dung MutationObserver de chi init khi login screen visible.
 * Render at half resolution + throttle 30fps de tiet kiem GPU.
 */

(function() {
  function initThreads(container: HTMLElement): void {
    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:0';
    container.style.position = 'relative';
    container.insertBefore(canvas, container.firstChild);

    const gl = canvas.getContext('webgl', {
      alpha: true, premultipliedAlpha: false,
      antialias: false, powerPreference: 'low-power'
    });
    if (!gl) return;
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    const vert = `attribute vec2 a;void main(){gl_Position=vec4(a,0,1);}`;
    const frag = `
precision mediump float;
uniform float iTime;
uniform vec2 iRes;
uniform vec2 uMouse;
uniform float uAmp;
uniform float uDist;
uniform vec3 uColor;
#define PI 3.14159
#define LC 24
float perlin(vec2 P){
  vec2 Pi=floor(P);
  vec4 Pf=P.xyxy-vec4(Pi,Pi+1.0);
  vec4 Pt=vec4(Pi.xy,Pi.xy+1.0);
  Pt=Pt-floor(Pt*(1.0/71.0))*71.0;
  Pt+=vec2(26.0,161.0).xyxy;
  Pt*=Pt; Pt=Pt.xzxz*Pt.yyww;
  vec4 hx=fract(Pt*(1.0/951.135664));
  vec4 hy=fract(Pt*(1.0/642.949883));
  vec4 gx=hx-0.49999,gy=hy-0.49999;
  vec4 l=sqrt(gx*gx+gy*gy)+0.0001;
  vec4 gr=(gx*Pf.xzxz+gy*Pf.yyww)/l*1.4142;
  vec2 bl=Pf.xy*Pf.xy*Pf.xy*(Pf.xy*(Pf.xy*6.0-15.0)+10.0);
  vec4 bl2=vec4(bl,vec2(1.0-bl));
  return dot(gr,bl2.zxzx*bl2.wwyy);
}
float px(){return 1.0/max(iRes.x,iRes.y);}
float lineFn(vec2 st,float w,float p,float t){
  float sp=0.1+p*0.4;
  float an=smoothstep(sp,0.7,st.x)*0.5*uAmp*(1.0+(uMouse.y-0.5)*0.2);
  float ts=t/10.0+(uMouse.x-0.5);
  float blur=smoothstep(sp,sp+0.05,st.x)*p;
  float xn=mix(
    perlin(vec2(ts,st.x+p)*2.0),
    perlin(vec2(ts,st.x+ts)*3.0)/1.5,
    st.x*0.3
  );
  float y=0.5+(p-0.5)*uDist+xn*0.5*an;
  float wb=w*0.5+8.0*px()*blur;
  float ls=smoothstep(y+wb,y,st.y);
  float le=smoothstep(y,y-wb,st.y);
  return clamp((ls-le)*(1.0-smoothstep(0.0,1.0,pow(p,0.3))),0.0,1.0);
}
void main(){
  vec2 uv=gl_FragCoord.xy/iRes;
  float s=1.0;
  for(int i=0;i<LC;i++){
    float p=float(i)/float(LC);
    s*=1.0-lineFn(uv,7.0*px()*(1.0-p),p,iTime);
  }
  float c=1.0-s;
  gl_FragColor=vec4(uColor*c,c*0.85);
}`;

    function compile(type: number, src: string): WebGLShader {
      const sh = gl!.createShader(type)!;
      gl!.shaderSource(sh, src); gl!.compileShader(sh); return sh;
    }
    const prog = gl.createProgram()!;
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, vert));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, frag));
    gl.linkProgram(prog); gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,3,-1,-1,3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'a');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const uTime  = gl.getUniformLocation(prog, 'iTime');
    const uRes   = gl.getUniformLocation(prog, 'iRes');
    const uMouse = gl.getUniformLocation(prog, 'uMouse');
    const uAmp   = gl.getUniformLocation(prog, 'uAmp');
    const uDist  = gl.getUniformLocation(prog, 'uDist');
    const uColor = gl.getUniformLocation(prog, 'uColor');

    gl.uniform3f(uColor, 0.05, 0.58, 0.53);
    gl.uniform1f(uAmp, 1.2);
    gl.uniform1f(uDist, 0.0);

    let mx=0.5,my=0.5,tmx=0.5,tmy=0.5,raf: number,dpr=1;

    function resize(): void {
      dpr = Math.min(window.devicePixelRatio || 1, 1.5) * 0.6;
      const w = Math.floor(container.clientWidth  * dpr);
      const h = Math.floor(container.clientHeight * dpr);
      canvas.width = w; canvas.height = h;
      gl!.viewport(0, 0, w, h);
      gl!.uniform2f(uRes, w, h);
    }
    window.addEventListener('resize', resize); resize();

    container.addEventListener('mousemove', (e: MouseEvent) => {
      const r = container.getBoundingClientRect();
      tmx = (e.clientX - r.left) / r.width;
      tmy = 1-(e.clientY - r.top) / r.height;
    });
    container.addEventListener('mouseleave', () => { tmx=0.5; tmy=0.5; });

    let last = 0;
    function draw(t: number): void {
      raf = requestAnimationFrame(draw);
      if (t - last < 33) return;
      last = t;

      mx += 0.04*(tmx-mx);
      my += 0.04*(tmy-my);
      gl!.uniform2f(uMouse, mx, my);
      gl!.uniform1f(uTime, t*0.002);
      gl!.clearColor(0,0,0,0);
      gl!.clear(gl!.COLOR_BUFFER_BIT);
      gl!.drawArrays(gl!.TRIANGLES, 0, 3);
    }
    raf = requestAnimationFrame(draw);

    const obs = new MutationObserver(() => {
      if (container.style.display === 'none') {
        cancelAnimationFrame(raf);
        obs.disconnect();
      }
    });
    obs.observe(container, { attributes: true, attributeFilter: ['style'] });
  }

  // Doi DOM ready truoc khi tim login-screen
  function setup(): void {
    const loginScreen = document.getElementById('login-screen') as HTMLElement | null;
    if (!loginScreen) return;
    const mo = new MutationObserver(() => {
      if (loginScreen.style.display !== 'none' && !loginScreen.dataset.threadsInit) {
        loginScreen.dataset.threadsInit = '1';
        initThreads(loginScreen);
      }
    });
    mo.observe(loginScreen, { attributes: true, attributeFilter: ['style'] });
    // Neu login screen da visible ngay tu dau, init luon
    if (loginScreen.style.display !== 'none' && !loginScreen.dataset.threadsInit) {
      loginScreen.dataset.threadsInit = '1';
      initThreads(loginScreen);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setup);
  } else {
    setup();
  }
})();

// Module marker
export {};
