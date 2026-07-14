// ==========================================================================
// 1. CONFIGURAÇÃO E CONEXÃO COM O SUPABASE
// ==========================================================================
const SUPABASE_URL = "https://nknwspfgczztlpyqhrze.supabase.co"; 
const SUPABASE_ANON_KEY = "sb_publishable_rD2OwfwkhBim8QEO7syjyg_hpaRF_VH";

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Elementos Globais
const navButtons = document.querySelectorAll('.nav-button');
const pageButtons = document.querySelectorAll('.nav-button[data-page]');
const pages = document.querySelectorAll('.page');
const LIKED_STORAGE_KEY = 'desenhos-curtidos';

let desenhosCarregados = [];
let likedIds = carregarCurtidas();
let previewUrlAtual = null;
let desenhoAtivoNoModal = null; // Guarda o desenho que está aberto no momento
let arquivoSelecionado = null;  // Guarda o arquivo final (convertido ou original) para upload

// ==========================================================================
// 2. SISTEMA DE CURTIDAS (LOCALSTORAGE + BANCO)
// ==========================================================================
function carregarCurtidas() {
  try {
    const valor = localStorage.getItem(LIKED_STORAGE_KEY);
    if (!valor) return [];
    const parsed = JSON.parse(valor);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error(error);
    return [];
  }
}

function salvarCurtidas() {
  localStorage.setItem(LIKED_STORAGE_KEY, JSON.stringify(likedIds));
}

async function atualizarLikeNoBanco(id, incremental) {
  try {
    const { data, error: fetchError } = await supabaseClient
      .from('Galeria de fotos')
      .select('likes_count')
      .eq('id', id)
      .single();

    if (fetchError) {
      console.warn("Nota: Coluna 'likes_count' não encontrada ou erro ao buscar. Ignorando update de likes.");
      return;
    }

    const novoTotal = Math.max(0, (data.likes_count || 0) + incremental);

    await supabaseClient
      .from('Galeria de fotos')
      .update({ likes_count: novoTotal })
      .eq('id', id);

  } catch (error) {
    console.error("Erro ao atualizar likes no Supabase:", error);
  }
}

function alternarCurtidaSilenciosa(id) {
  const idString = String(id);
  const jaCurtido = likedIds.includes(idString);

  if (jaCurtido) {
    likedIds = likedIds.filter(item => item !== idString);
    atualizarLikeNoBanco(id, -1);
  } else {
    likedIds = [...likedIds, idString];
    atualizarLikeNoBanco(id, 1);
  }

  salvarCurtidas();
}

function estaCurtida(id) {
  return likedIds.includes(String(id));
}

// ==========================================================================
// 3. NAVEGAÇÃO DA PÁGINA
// ==========================================================================
function showPage(pageId) {
  pages.forEach(page => {
    page.classList.remove('is-returning');
    page.classList.toggle('active', page.id === pageId);
  });

  if (pageId === 'page-home') {
    const activePage = document.querySelector('.page.active');
    if (activePage) activePage.classList.add('is-returning');
  }

  pageButtons.forEach(button => {
    const target = button.dataset.page;
    const isActive = Boolean(target) && `page-${target}` === pageId;
    button.classList.toggle('active', isActive);
    button.dataset.state = isActive ? 'active' : 'inactive';
    button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  });

  const filterPanel = document.getElementById('filter-panel');
  const filterButton = document.querySelector('.nav-button[data-action="filter"]');
  if (filterPanel && filterButton && pageId !== 'page-home') {
    filterPanel.classList.add('hidden');
    filterPanel.setAttribute('aria-hidden', 'true');
    filterButton.classList.remove('filter-open');
    filterButton.setAttribute('aria-expanded', 'false');
  }

  if (pageId === 'page-likes') renderizarCurtidas();

  localStorage.setItem('ultima-pagina-caio', pageId);
}

function toggleFilterPanel(button) {
  const filterPanel = document.getElementById('filter-panel');
  if (!filterPanel) return;

  const isHidden = filterPanel.classList.contains('hidden');
  if (isHidden) {
    showPage('page-home');
    filterPanel.classList.remove('hidden');
    filterPanel.setAttribute('aria-hidden', 'false');
    button.classList.add('filter-open');
    button.setAttribute('aria-expanded', 'true');
    return;
  }

  filterPanel.classList.add('hidden');
  filterPanel.setAttribute('aria-hidden', 'true');
  button.classList.remove('filter-open');
  button.setAttribute('aria-expanded', 'false');
  showPage('page-home');
}

// ==========================================================================
// 4. FILTROS, PREVIEW E SELEÇÃO DE ARQUIVOS
// ==========================================================================
function aplicarFiltro() {
  const container = document.getElementById('galeria-fotos');
  if (!container) return;

  const orderSelect = document.getElementById('filter-order');
  const ordem = orderSelect?.value || 'newest';

  const ordenados = [...desenhosCarregados].sort((a, b) => {
    const dataA = new Date(a.created_at || 0).getTime();
    const dataB = new Date(b.created_at || 0).getTime();
    return ordem === 'oldest' ? dataA - dataB : dataB - dataA;
  });

  renderizarGaleria(container, ordenados);
}

function renderizarGaleria(container, desenhos) {
  container.innerHTML = '';

  if (!desenhos || desenhos.length === 0) {
    container.innerHTML = "<p class='empty-state'>Nenhum desenho encontrado.</p>";
    return;
  }

  const modal = document.getElementById('foto-modal');
  const modalImg = document.getElementById('modal-img');
  const modalTitulo = document.getElementById('modal-titulo');
  const modalDescricao = document.getElementById('modal-descricao');
  const modalData = document.getElementById('modal-data');

  desenhos.forEach(desenho => {
    const item = document.createElement('div');
    item.classList.add('gallery-item');

    const img = document.createElement('img');
    img.src = desenho.image_url;
    img.loading = 'lazy';
    img.alt = desenho.titulo || 'Desenho';

    const tituloLegenda = document.createElement('p');
    tituloLegenda.classList.add('gallery-item-title');
    tituloLegenda.innerText = desenho.titulo || 'Sem título';

    const likeButton = document.createElement('button');
    likeButton.type = 'button';
    likeButton.className = `like-btn${estaCurtida(desenho.id) ? ' active' : ''}`;
    likeButton.innerHTML = estaCurtida(desenho.id) ? '♥' : '♡';
    likeButton.setAttribute('aria-label', estaCurtida(desenho.id) ? 'Remover curtida' : 'Curtir desenho');
    
    likeButton.addEventListener('click', event => {
      event.stopPropagation();
      const jaCurtido = estaCurtida(desenho.id);
      likeButton.classList.remove('pop-animation', 'unpop-animation');
      
      if (jaCurtido) {
        likeButton.classList.remove('active');
        likeButton.innerHTML = '♡';
        likeButton.setAttribute('aria-label', 'Curtir desenho');
        likeButton.classList.add('unpop-animation');
      } else {
        likeButton.classList.add('active');
        likeButton.innerHTML = '♥';
        likeButton.setAttribute('aria-label', 'Remover curtida');
        likeButton.classList.add('pop-animation');
      }
      
      likeButton.addEventListener('animationend', () => {
        likeButton.classList.remove('pop-animation', 'unpop-animation');
      }, { once: true });

      alternarCurtidaSilenciosa(desenho.id);
    });

    item.addEventListener('click', () => {
      desenhoAtivoNoModal = desenho; 
      if (modalImg) modalImg.src = desenho.image_url;
      if (modalTitulo) modalTitulo.innerText = desenho.titulo || 'Desenho sem título';
      if (modalDescricao) modalDescricao.innerText = desenho.descricao || 'Sem descrição disponível.';
      if (modalData) {
        const dataFormatada = desenho.created_at
          ? new Date(desenho.created_at).toLocaleDateString('pt-BR')
          : '--/--/----';
        modalData.innerText = `Postado em: ${dataFormatada}`;
      }
      if (modal) modal.classList.add('open');
    });

    item.appendChild(img);
    item.appendChild(tituloLegenda);
    item.appendChild(likeButton);
    container.appendChild(item);
  });
}

function renderizarCurtidas() {
  const container = document.getElementById('galeria-curtidas');
  if (!container) return;

  const fotosCurtidas = desenhosCarregados.filter(desenho => estaCurtida(desenho.id));

  if (!fotosCurtidas.length) {
    container.innerHTML = "<p class='empty-state'>Você ainda não marcou nenhum desenho como favorito.</p>";
    return;
  }

  renderizarGaleria(container, fotosCurtidas);
}

function limparPreviewImagem() {
  const previewContainer = document.getElementById('preview-container-inline');
  const previewImg = document.getElementById('preview-img-inline');
  const previewName = document.getElementById('preview-name-inline');

  if (previewUrlAtual) {
    URL.revokeObjectURL(previewUrlAtual);
    previewUrlAtual = null;
  }

  arquivoSelecionado = null;
  if (previewImg) previewImg.removeAttribute('src');
  if (previewName) previewName.textContent = '';
  if (previewContainer) previewContainer.classList.add('hidden');
}

function atualizarPreviewImagem(arquivo, statusElement) {
  const previewContainer = document.getElementById('preview-container-inline');
  const previewImg = document.getElementById('preview-img-inline');
  const previewName = document.getElementById('preview-name-inline');

  if (!previewContainer || !previewImg || !previewName) return;

  if (!arquivo) {
    limparPreviewImagem();
    if (statusElement) statusElement.textContent = 'Nenhuma imagem selecionada.';
    return;
  }

  if (previewUrlAtual) URL.revokeObjectURL(previewUrlAtual);

  previewUrlAtual = URL.createObjectURL(arquivo);
  previewImg.src = previewUrlAtual;
  previewImg.alt = `Pré-visualização de ${arquivo.name}`;
  previewName.textContent = arquivo.name;
  previewContainer.classList.remove('hidden');

  if (statusElement) statusElement.textContent = `Imagem selecionada: ${arquivo.name}`;
}

// Escuta a seleção do arquivo, trata HEIC e gera o Preview
async function gerenciarSelecaoDeArquivo(event) {
  const fileInput = event.target;
  const statusUpload = document.getElementById('status-upload-inline');
  let file = fileInput.files?.[0];

  if (!file) {
    limparPreviewImagem();
    return;
  }

  // Se for HEIC/HEIF, roda o conversor
  if (file.name.toLowerCase().endsWith('.heic') || file.type === 'image/heic') {
    if (statusUpload) statusUpload.textContent = 'Convertendo imagem HEIC... Por favor, aguarde.';
    try {
      // heic2any precisa estar importado no HTML
      const blobConvertido = await heic2any({
        blob: file,
        toType: "image/jpeg",
        quality: 0.8
      });

      const novoNome = file.name.replace(/\.[^/.]+$/, "") + ".jpeg";
      file = new File([blobConvertido], novoNome, { type: "image/jpeg" });
    } catch (error) {
      console.error("Erro ao converter HEIC:", error);
      alert("Não foi possível processar esta imagem HEIC. Tente usar PNG ou JPEG.");
      limparPreviewImagem();
      fileInput.value = "";
      return;
    }
  }

  // Guarda o arquivo final na variável global e atualiza o preview
  arquivoSelecionado = file;
  atualizarPreviewImagem(file, statusUpload);
}

// Ouvintes para a barra de navegação
navButtons.forEach(button => {
  button.addEventListener('click', () => {
    const action = button.dataset.action;
    if (action === 'filter') {
      toggleFilterPanel(button);
      return;
    }

    const target = button.dataset.page;
    if (!target) return;

    const nextPageId = `page-${target}`;
    const currentPageId = document.querySelector('.page.active')?.id || 'page-home';

    if (currentPageId === nextPageId) {
      showPage('page-home');
      return;
    }
    showPage(nextPageId);
  });
});

// ==========================================================================
// 5. OPERAÇÕES SUPABASE (BUSCAR, ENVIAR E EXCLUIR)
// ==========================================================================
async function carregarGaleria() {
  const container = document.getElementById('galeria-fotos');
  if (!container) return;

  container.innerHTML = "<p class='loading'>A carregar desenhos...</p>";

  try {
    const { data, error } = await supabaseClient
      .from('Galeria de fotos') 
      .select('*');

    if (error) throw error;

    desenhosCarregados = (data || []).map(item => ({
      id: item.id,
      image_url: item.url_imagem, 
      created_at: item.criado_em,  
      titulo: item.titulo || 'Desenho',
      descricao: item.descricao || ''
    }));

    aplicarFiltro();
    renderizarCurtidas();
  } catch (error) {
    console.error("Erro ao carregar dados do Supabase:", error);
    container.innerHTML = "<p class='empty-state'>Erro ao carregar os desenhos.</p>";
  }
}

async function enviarDesenho(event) {
  event.preventDefault();

  const form = document.getElementById('form-upload-inline');
  const status = document.getElementById('status-upload-inline');
  
  const tituloInput = document.getElementById('titulo-inline');
  const descInput = document.getElementById('descricao-inline');
  const dataInput = document.getElementById('data-inline');

  if (!form || !status) return;

  // Usa o arquivo selecionado previamente tratado (HEIC convertido ou padrão)
  const arquivo = arquivoSelecionado;
  if (!arquivo) {
    status.textContent = 'Seleciona uma imagem primeiro.';
    return;
  }

  status.textContent = 'A enviar imagem...';
  status.classList.remove('status-success', 'status-error');

  try {
    const nomeArquivo = `${Date.now()}_${arquivo.name}`;
    const { data: storageData, error: storageError } = await supabaseClient
      .storage
      .from('desenhos')
      .upload(nomeArquivo, arquivo);

    if (storageError) throw storageError;

    const { data: urlData } = supabaseClient
      .storage
      .from('desenhos')
      .getPublicUrl(nomeArquivo);

    const publicUrl = urlData.publicUrl;

    const dataDoDesenho = dataInput && dataInput.value 
      ? new Date(`${dataInput.value}T12:00:00`).toISOString()
      : new Date().toISOString();

    const dadosParaSalvar = {
      url_imagem: publicUrl,
      titulo: tituloInput?.value || arquivo.name,
      descricao: descInput?.value || '',
      criado_em: dataDoDesenho
    };

    const { error: dbError } = await supabaseClient
      .from('Galeria de fotos')
      .insert([dadosParaSalvar]);

    if (dbError) throw dbError;

    status.textContent = 'Imagem enviada com sucesso!';
    status.classList.add('status-success');
    form.reset();
    limparPreviewImagem();
    showPage('page-home');
    carregarGaleria();
  } catch (error) {
    console.error("ERRO DETALHADO NO ENVIO:", error);
    status.textContent = error.message || 'Erro inesperado ao guardar.';
    status.classList.add('status-error');
  }
}

// Função de Deletar Registro e Arquivo do Supabase
async function deletarDesenhoAtivo() {
  if (!desenhoAtivoNoModal) return;

  const confirmar = confirm(`Tem certeza que deseja excluir o desenho "${desenhoAtivoNoModal.titulo}" permanentemente?`);
  if (!confirmar) return;

  try {
    const idParaDeletar = desenhoAtivoNoModal.id;
    const urlImagem = desenhoAtivoNoModal.image_url;

    let nomeArquivo = urlImagem.split('/').pop().split('?')[0];
    nomeArquivo = decodeURIComponent(nomeArquivo);

    if (nomeArquivo) {
      const { error: storageError } = await supabaseClient
        .storage
        .from('desenhos')
        .remove([nomeArquivo]);

      if (storageError) {
        console.warn("Aviso ao deletar arquivo do Storage:", storageError.message);
      }
    }

    const { error: dbError } = await supabaseClient
      .from('Galeria de fotos')
      .delete()
      .eq('id', idParaDeletar);

    if (dbError) throw dbError;

    alert("Desenho excluído com sucesso!");
    
    const modal = document.getElementById('foto-modal');
    if (modal) {
      modal.classList.add('closing');
      setTimeout(() => {
        modal.classList.remove('open', 'closing');
      }, 350);
    }
    
    desenhoAtivoNoModal = null;
    carregarGaleria();

  } catch (error) {
    console.error("Erro ao deletar o desenho:", error);
    alert(`Não foi possível excluir o desenho: ${error.message}`);
  }
}

// ==========================================================================
// 6. INICIALIZADOR DO SISTEMA
// ==========================================================================
window.addEventListener('DOMContentLoaded', () => {
  const ultimaPagina = localStorage.getItem('ultima-pagina-caio') || 'page-home';
  showPage(ultimaPagina);
  
  carregarGaleria();

  const formUpload = document.getElementById('form-upload-inline');
  const fileInput = document.getElementById('input-foto-inline');

  if (formUpload) formUpload.addEventListener('submit', enviarDesenho);

  if (fileInput) {
    fileInput.addEventListener('change', gerenciarSelecaoDeArquivo);
  }

  const orderSelect = document.getElementById('filter-order');
  orderSelect?.addEventListener('change', aplicarFiltro);

  // Botão de Deletar no Modal
  const btnExcluir = document.getElementById('btn-excluir-desenho');
  if (btnExcluir) {
    btnExcluir.addEventListener('click', deletarDesenhoAtivo);
  }

  // Escuta para fechar o modal ao clicar no botão 'X' ou fora dele
  const fecharModal = document.getElementById('fechar-modal');
  const modal = document.getElementById('foto-modal');
  
  function closeModalWithAnimation() {
    if (modal) {
      modal.classList.add('closing');
      setTimeout(() => {
        modal.classList.remove('open', 'closing');
      }, 350);
    }
  }
  
  if (fecharModal && modal) {
    fecharModal.addEventListener('click', closeModalWithAnimation);
    
    modal.addEventListener('click', (event) => {
      if (event.target === modal) {
        closeModalWithAnimation();
      }
    });
  }

  const fullscreenBtn = document.getElementById('fullscreen-btn');
  const modalImg = document.getElementById('modal-img');

  if (fullscreenBtn && modalImg) {
    fullscreenBtn.addEventListener('click', (event) => {
      event.stopPropagation();

      if (modalImg.requestFullscreen) {
        modalImg.requestFullscreen();
      } else if (modalImg.webkitRequestFullscreen) {
        modalImg.webkitRequestFullscreen();
      } else if (modalImg.msRequestFullscreen) {
        modalImg.msRequestFullscreen();
      }
    });
  }
});