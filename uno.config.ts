import { defineConfig, presetTypography, presetUno } from 'unocss'

export default defineConfig({
  theme: {
    colors: {
      ink: '#1f2a24',
      fern: '#2f5e3a',
      moss: '#9bb89a',
      sand: '#f2eadc',
      ember: '#c86b2a',
      fog: '#eef1ed',
    },
    fontFamily: {
      sans: '"Work Sans", ui-sans-serif, system-ui, sans-serif',
      display: '"Fraunces", ui-serif, serif',
    },
  },
  presets: [presetUno(), presetTypography()],
})
