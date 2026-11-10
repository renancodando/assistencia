// Interface em HTML: ordem de serviço (navegação) e pedido de orçamento.
const WHATSAPP = '5511900000000'; // trocar pelo número real da loja

export function initUI() {
  const steps = [...document.querySelectorAll('.os li')];
  const html = document.documentElement;
  let last = -1;

  const form = document.getElementById('orcamento-form');
  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const data = new FormData(form);
      const modelo = (data.get('modelo') || '').toString().trim();
      const nome = (data.get('nome') || '').toString().trim();
      const defeito = data.get('defeito');
      const err = form.querySelector('.form-error');
      if (!modelo) {
        err.textContent = 'Informe o modelo do aparelho para a gente calcular o orçamento.';
        form.querySelector('[name=modelo]').focus();
        return;
      }
      err.textContent = '';
      const msg = `Olá! ${nome ? `Meu nome é ${nome}. ` : ''}Quero um orçamento para um ${modelo}. Problema: ${defeito}.`;
      window.open(`https://wa.me/${WHATSAPP}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener');
    });
  }

  return {
    setChapter(f) {
      const i = Math.round(f);
      if (i === last) return;
      last = i;
      html.dataset.chapter = i;
      steps.forEach((li, k) => {
        li.classList.toggle('done', k < i);
        li.classList.toggle('now', k === i);
        const a = li.querySelector('a');
        if (k === i) a.setAttribute('aria-current', 'step');
        else a.removeAttribute('aria-current');
      });
    },
  };
}
