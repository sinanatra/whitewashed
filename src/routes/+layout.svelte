<script>
  import '../app.css';

  let { children } = $props();
</script>

<svg aria-hidden="true" width="0" height="0" class="absolute pointer-events-none">
  <filter id="site-black-threshold" color-interpolation-filters="sRGB">
    <feColorMatrix type="saturate" values="0" result="mono" />
    <feComponentTransfer in="mono">
      <feFuncR type="discrete" tableValues="0 0 0 1 1 1" />
      <feFuncG type="discrete" tableValues="0 0 0 1 1 1" />
      <feFuncB type="discrete" tableValues="0 0 0 1 1 1" />
    </feComponentTransfer>
  </filter>
</svg>

<div class="site-threshold">
  {@render children()}
</div>
