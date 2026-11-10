import { useEffect, useRef } from 'react';

interface Props {
  intensity?: 'full' | 'quiet';
}

const vertexSource = `
  attribute vec2 position;
  varying vec2 uv;
  void main() {
    uv = position * 0.5 + 0.5;
    gl_Position = vec4(position, 0.0, 1.0);
  }
`;

const fragmentSource = `
  precision highp float;
  varying vec2 uv;
  uniform sampler2D previous;
  uniform vec2 pointer;
  uniform vec2 velocity;
  uniform vec2 resolution;
  uniform float time;
  uniform float intensity;
  uniform float active;
  uniform float decay;

  float hash21(vec2 value) {
    return fract(sin(dot(value, vec2(127.1, 311.7))) * 43758.5453);
  }

  float starLayer(vec2 position, vec2 grid, float threshold, float size, float twinkleSpeed) {
    vec2 cell = floor(position * grid);
    vec2 local = fract(position * grid);
    vec2 starPosition = vec2(
      0.18 + hash21(cell + 4.0) * 0.64,
      0.18 + hash21(cell + 17.0) * 0.64
    );
    float distanceToStar = length(local - starPosition);
    float present = step(threshold, hash21(cell + 29.0));
    float point = 1.0 - smoothstep(0.0, size, distanceToStar);
    float twinkle = 0.82 + 0.18 * sin(time * twinkleSpeed + hash21(cell + 43.0) * 6.2831);
    return present * point * twinkle;
  }

  void main() {
    vec2 aspect = vec2(resolution.x / resolution.y, 1.0);
    vec2 centered = (uv - 0.5) * aspect;
    vec2 flow = vec2(
      sin(centered.y * 7.0 + time * 0.000225) + sin(centered.y * 17.0 - time * 0.0001375),
      cos(centered.x * 6.0 - time * 0.0001875) + cos(centered.x * 15.0 + time * 0.0001125)
    ) * 0.00042 * intensity;
    vec2 pointerOffset = (uv - pointer) * aspect;
    float radius = max(length(pointerOffset), 0.0001);
    vec2 vortex = vec2(-pointerOffset.y, pointerOffset.x) / radius;
    flow += vortex * exp(-radius * 10.0) * length(velocity) * 0.0015 * intensity;
    vec2 sampleUv = uv - flow - velocity * 0.0015 * intensity;
    vec4 oldDye = texture2D(previous, sampleUv);
    oldDye.rgb *= decay;
    oldDye.a = max(oldDye.a * decay, 0.0);

    float trail = exp(-radius * (24.0 - min(length(velocity) * 0.8, 12.0)));
    float direction = 0.5 + 0.5 * dot(normalize(pointerOffset + 0.0001), normalize(velocity + 0.0001));
    float injection = trail * active * (0.25 + min(length(velocity) * 0.045, 0.75));
    float turbulence = 0.5 + 0.5 * sin(time * 0.001 + radius * 32.0 + direction * 4.0);
    vec3 emerald = mix(vec3(0.01, 0.24, 0.12), vec3(0.08, 0.78, 0.36), turbulence);
    vec3 starlitGas = mix(emerald, vec3(0.72, 0.9, 0.8), smoothstep(0.72, 1.0, turbulence) * 0.2);
    vec3 result = oldDye.rgb + starlitGas * injection * 0.14;

    float distantStars = starLayer(uv, vec2(44.0, 30.0), 0.985, 0.12, 0.525);
    float nearStars = starLayer(uv + vec2(0.13, 0.07), vec2(25.0, 18.0), 0.992, 0.085, 0.825);
    float brightStars = starLayer(uv + vec2(0.31, 0.19), vec2(31.0, 21.0), 0.997, 0.055, 0.96);
    float dust = (
      sin(centered.x * 11.0 + time * 0.00005) +
      sin(centered.y * 15.0 - time * 0.0000375) +
      sin((centered.x + centered.y) * 8.0)
    ) * 0.0008 + 0.001;
    vec3 space = vec3(distantStars * 0.045 + nearStars * 0.095) * vec3(0.52, 0.72, 0.61);
    space += brightStars * vec3(0.72, 0.9, 0.82) * 0.16;
    space += vec3(max(dust, 0.0)) * vec3(0.01, 0.05, 0.025);
    result += space * (0.35 + intensity * 0.65);
    gl_FragColor = vec4(min(result, vec3(0.8)), min(1.0, oldDye.a + injection * 0.3));
  }
`;

function compile(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

export function CosmicBackground({ intensity = 'full' }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const gl = canvas?.getContext('webgl', { alpha: false, antialias: false, powerPreference: 'low-power' });
    if (!canvas || !gl) return;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const program = gl.createProgram();
    const vertex = compile(gl, gl.VERTEX_SHADER, vertexSource);
    const fragment = compile(gl, gl.FRAGMENT_SHADER, fragmentSource);
    if (!program || !vertex || !fragment) return;
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, 'position');
    const previous = gl.getUniformLocation(program, 'previous');
    const pointer = gl.getUniformLocation(program, 'pointer');
    const velocity = gl.getUniformLocation(program, 'velocity');
    const resolution = gl.getUniformLocation(program, 'resolution');
    const time = gl.getUniformLocation(program, 'time');
    const intensityUniform = gl.getUniformLocation(program, 'intensity');
    const active = gl.getUniformLocation(program, 'active');
    const decay = gl.getUniformLocation(program, 'decay');

    const textures = [gl.createTexture(), gl.createTexture()];
    const framebuffers = [gl.createFramebuffer(), gl.createFramebuffer()];
    if (textures.some((texture) => !texture) || framebuffers.some((framebuffer) => !framebuffer)) return;

    let width = 1;
    let height = 1;
    let read = 0;
    let frame = 0;
    let running = !document.hidden;
    let pointerX = -1;
    let pointerY = -1;
    let velocityX = 0;
    let velocityY = 0;
    let activePointer = 0;

    const resize = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 1.25);
      const bounds = canvas.getBoundingClientRect();
      width = Math.max(1, Math.floor(bounds.width * ratio * 0.35));
      height = Math.max(1, Math.floor(bounds.height * ratio * 0.35));
      canvas.width = width;
      canvas.height = height;
      textures.forEach((texture, index) => {
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffers[index]);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
      });
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    };

    const isUiTarget = (target: EventTarget | null) =>
      target instanceof Element && Boolean(target.closest('button, input, textarea, select, a, video, .controls, .panel'));

    const onPointerMove = (event: PointerEvent) => {
      if (isUiTarget(event.target)) return;
      const bounds = canvas.getBoundingClientRect();
      if (bounds.width <= 0 || bounds.height <= 0) return;
      const localX = event.clientX - bounds.left;
      const localY = event.clientY - bounds.top;
      const nextX = Math.min(1, Math.max(0, localX / bounds.width));
      const nextY = 1 - Math.min(1, Math.max(0, localY / bounds.height));
      velocityX = nextX - pointerX;
      velocityY = nextY - pointerY;
      pointerX = nextX;
      pointerY = nextY;
      activePointer = 1;
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!isUiTarget(event.target)) activePointer = 1;
    };
    const onPointerUp = () => {
      activePointer = 0;
    };
    const onVisibilityChange = () => {
      running = !document.hidden;
      if (running && !reducedMotion) frame = requestAnimationFrame(render);
    };

    const render = (now: number) => {
      if (!running) return;
      gl.useProgram(program);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.enableVertexAttribArray(position);
      gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffers[1 - read]);
      gl.viewport(0, 0, width, height);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, textures[read]);
      gl.uniform1i(previous, 0);
      gl.uniform2f(pointer, pointerX, pointerY);
      gl.uniform2f(velocity, velocityX, velocityY);
      gl.uniform2f(resolution, width, height);
      gl.uniform1f(time, now);
      gl.uniform1f(intensityUniform, intensity === 'quiet' ? 0.3 : 1);
      gl.uniform1f(active, reducedMotion ? 0 : activePointer);
      gl.uniform1f(decay, intensity === 'quiet' ? 0.982 : 0.99);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.clearColor(0.007, 0.031, 0.02, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.bindTexture(gl.TEXTURE_2D, textures[1 - read]);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      read = 1 - read;
      velocityX *= 0.88;
      velocityY *= 0.88;
      if (!reducedMotion) frame = requestAnimationFrame(render);
    };

    resize();
    window.addEventListener('resize', resize);
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerdown', onPointerDown, { passive: true });
    window.addEventListener('pointerup', onPointerUp, { passive: true });
    document.addEventListener('visibilitychange', onVisibilityChange);
    render(0);

    return () => {
      running = false;
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointerup', onPointerUp);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      textures.forEach((texture) => texture && gl.deleteTexture(texture));
      framebuffers.forEach((framebuffer) => framebuffer && gl.deleteFramebuffer(framebuffer));
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
    };
  }, [intensity]);

  return <canvas className={`cosmic-background cosmic-background--${intensity}`} ref={canvasRef} aria-hidden="true" />;
}
