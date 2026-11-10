# Reparo Fino — assistência técnica de celulares

O site é a bancada do técnico: uma cena 3D em tempo real (three.js) em que rolar a página desmonta
e conserta o aparelho. Nenhuma imagem externa — manta, trinca, tela, placa e etiquetas são geradas
em canvas.

```bash
npm install
npm run dev      # desenvolvimento
npm run build    # gera dist/ (estático, hospeda em qualquer lugar)
```

## Onde trocar o conteúdo

- Textos, preços, endereço e horários: `index.html`
- Número do WhatsApp: `src/ui.js` (`WHATSAPP`) e o link `tel:` em `index.html`
- Nome serigrafado na manta e textos da tela do aparelho: `src/textures.js`
- Roteiro da animação (posição de cada peça e da câmera por capítulo): `SCRIPT` em `src/main.js`

Nome, preços, endereço e telefone atuais são fictícios.
