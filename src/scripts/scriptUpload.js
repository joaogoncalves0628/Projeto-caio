const API_URL = '/api/desenhos';

const formUpload = document.getElementById('form-upload');
const arquivoInput = document.getElementById('input-foto');
const statusText = document.getElementById('status-upload');
const dataInput = document.getElementById('data');

if (dataInput && !dataInput.value) {
  const hoje = new Date();
  const valor = hoje.toISOString().split('T')[0];
  dataInput.value = valor;
}

if (formUpload && arquivoInput && statusText) {
  formUpload.addEventListener('submit', async (event) => {
    event.preventDefault();

    const arquivo = arquivoInput.files[0];
    if (!arquivo) {
      statusText.textContent = '❌ Selecione uma imagem primeiro.';
      return;
    }

    const dados = new FormData(formUpload);
    statusText.textContent = '⏳ Enviando desenho...';

    try {
      const resposta = await fetch(API_URL, {
        method: 'POST',
        body: dados
      });

      const resultado = await resposta.json();
      if (!resposta.ok) {
        throw new Error(resultado.error || 'Erro ao enviar imagem.');
      }

      statusText.textContent = '✅ Desenho publicado com sucesso!';
      formUpload.reset();

      setTimeout(() => {
        window.location.href = 'index.html';
      }, 1200);
    } catch (error) {
      console.error(error);
      statusText.textContent = `❌ ${error.message}`;
    }
  });
}