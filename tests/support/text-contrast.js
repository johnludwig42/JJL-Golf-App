// Computed sRGB contrast, including translucent ink, ancestor opacity and
// gradient stop backgrounds. All stop combinations must meet the threshold.
export async function textContrast(page) {
  return page.evaluate(() => {
    const rgba = value => {
      const channels = value.match(/[\d.]+/g)?.map(Number) || [];
      if(value.startsWith('color(srgb '))return [channels[0]*255,channels[1]*255,channels[2]*255,channels[3] ?? 1];
      return [channels[0] || 0, channels[1] || 0, channels[2] || 0, channels[3] ?? 1];
    };
    const over = (foreground, background) => foreground.slice(0, 3).map((v, i) => v * foreground[3] + background[i] * (1 - foreground[3])).concat(1);
    const luminance = color => color.slice(0, 3).map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
    const contrast = (a, b) => (Math.max(luminance(a), luminance(b)) + .05) / (Math.min(luminance(a), luminance(b)) + .05);
    const results = [];
    for (const node of document.querySelectorAll('body *')) {
      if (['SCRIPT', 'STYLE', 'OPTION', 'SVG', 'PATH'].includes(node.tagName) || !node.checkVisibility({checkOpacity: true, checkVisibilityCSS: true})) continue;
      const text = [...node.childNodes].filter(child => child.nodeType === Node.TEXT_NODE).map(child => child.textContent.trim()).join(' ').trim();
      const input = ['INPUT', 'TEXTAREA'].includes(node.tagName);
      if (!text && !input) continue;
      if (node.closest(':disabled,[inert]')) continue;
      const style = getComputedStyle(node);
      // Player Mode's transparent score input sits over a visible readback.
      // That readback is measured separately; measure input ink when focused.
      if(input && node.matches('.player-mode-more-score input,.player-mode-more-stat input') && rgba(style.color)[3]===0) continue;
      const chain = []; for (let parent = node; parent; parent = parent.parentElement) chain.unshift(parent);
      let backgrounds = [[17, 24, 20, 1]];
      let opacity = 1;
      for (const parent of chain) {
        const computed = getComputedStyle(parent);
        opacity *= Number(computed.opacity);
        backgrounds = backgrounds.map(background => over(rgba(computed.backgroundColor), background));
        const stops = computed.backgroundImage.match(/rgba?\([^)]*\)/g);
        if (stops) backgrounds = backgrounds.flatMap(background => stops.map(stop => over(rgba(stop), background)));
      }
      const placeholder = input && !node.value && !!node.placeholder;
      const ink = rgba(placeholder ? getComputedStyle(node, '::placeholder').color : node.tagName === 'text' ? style.fill : style.color);
      ink[3] *= opacity * (placeholder ? Number(getComputedStyle(node, '::placeholder').opacity) : 1);
      const ratio = Math.min(...backgrounds.map(background => contrast(over(ink, background), background)));
      const required = parseFloat(style.fontSize) >= 24 || (parseFloat(style.fontSize) >= 18.6667 && Number(style.fontWeight) >= 700) ? 3 : 4.5;
      results.push({selector: node.id ? `#${node.id}` : `${node.tagName}.${node.className.baseVal ?? node.className}`, text: (placeholder ? node.placeholder : text || node.value).slice(0, 65), ratio: Math.round(ratio * 100) / 100, required, ink: style.color, background: backgrounds[0]});
    }
    return results;
  });
}
