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

// Atualiza os dados de curtidas em segundo plano sem recriar os elementos HTML na tela (mantém a animação lisa)
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

  // Guarda a última página visitada para não resetar no F5
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
// 4. FILTROS E PREVIEW DE IMAGEM
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

    const likeButton = document.createElement('button');
    likeButton.type = 'button';
    likeButton.className = `like-btn${estaCurtida(desenho.id) ? ' active' : ''}`;
    likeButton.innerHTML = estaCurtida(desenho.id) ? '♥' : '♡';
    likeButton.setAttribute('aria-label', estaCurtida(desenho.id) ? 'Remover curtida' : 'Curtir desenho');
    
    // Configura o evento de clique do Like com animação de Pop / Unpop
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

    // Evento para abrir o Modal de detalhes ao clicar na imagem
    item.addEventListener('click', () => {
      desenhoAtivoNoModal = desenho; // Salva qual desenho está ativo para podermos excluí-lo se necessário
      
      if (modalImg) modalImg.src = desenho.image_url;
      
      if (modalTitulo) {
        modalTitulo.innerText = desenho.titulo || 'Desenho sem título';
      }
      
      if (modalDescricao) {
        modalDescricao.innerText = desenho.descricao || 'Sem descrição disponível.';
      }
      
      if (modalData) {
        const dataFormatada = desenho.created_at
          ? new Date(desenho.created_at).toLocaleDateString('pt-BR')
          : '--/--/----';
        modalData.innerText = `Postado em: ${dataFormatada}`;
      }
      
      if (modal) modal.classList.add('open');
    });

    item.appendChild(img);
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
      descricao: item.descricao || '' // Mapeia a coluna de descrição criada no banco
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
  const fileInput = document.getElementById('input-foto-inline');
  
  // Capturando as entradas de metadados do seu formulário HTML
  const tituloInput = document.getElementById('titulo-inline') || document.getElementById('input-titulo-inline');
  const descInput = document.getElementById('descricao-inline') || document.getElementById('input-descricao-inline');
  const dataInput = document.getElementById('data-inline');

  if (!form || !status || !fileInput) return;

  const arquivo = fileInput.files[0];
  if (!arquivo) {
    status.textContent = 'Seleciona uma imagem primeiro.';
    return;
  }

  status.textContent = 'A enviar imagem...';
  status.classList.remove('status-success', 'status-error');

  try {
    // 1. Envia o arquivo para o Bucket do Storage
    const nomeArquivo = `${Date.now()}_${arquivo.name}`;
    const { data: storageData, error: storageError } = await supabaseClient
      .storage
      .from('desenhos')
      .upload(nomeArquivo, arquivo);

    if (storageError) throw storageError;

    // 2. Pega o link público da imagem guardada
    const { data: urlData } = supabaseClient
      .storage
      .from('desenhos')
      .getPublicUrl(nomeArquivo);

    const publicUrl = urlData.publicUrl;

    // Formata a data fornecida pelo usuário ou usa a data atual do momento
    const dataDoDesenho = dataInput && dataInput.value 
      ? new Date(`${dataInput.value}T12:00:00`).toISOString()
      : new Date().toISOString();

    // 3. Prepara o objeto para salvar na tabela 'Galeria de fotos'
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

async function deletarDesenhoAtivo() {
  if (!desenhoAtivoNoModal) return;

  const confirmar = confirm(`Tem certeza que deseja excluir o desenho "${desenhoAtivoNoModal.titulo}" permanentemente?`);
  if (!confirmar) return;

  try {
    const idParaDeletar = desenhoAtivoNoModal.id;
    const urlImagem = desenhoAtivoNoModal.image_url;

    // 1. Extração segura do nome do arquivo
    let nomeArquivo = urlImagem.split('/').pop().split('?')[0];
    nomeArquivo = decodeURIComponent(nomeArquivo);

    // 2. Remove o arquivo físico do Storage
    if (nomeArquivo) {
      const { error: storageError } = await supabaseClient
        .storage
        .from('desenhos')
        .remove([nomeArquivo]);

      if (storageError) {
        console.warn("Aviso ao deletar arquivo do Storage:", storageError.message);
      }
    }

    // 3. Deleta o registro correspondente do Banco de Dados
    const { error: dbError } = await supabaseClient
      .from('Galeria de fotos')
      .delete()
      .eq('id', idParaDeletar);

    if (dbError) throw dbError;

    alert("Desenho excluído com sucesso!");
    
    const modal = document.getElementById('foto-modal');
    if (modal) modal.classList.remove('open');
    
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
  // Recupera a última página visitada para não resetar no F5
  const ultimaPagina = localStorage.getItem('ultima-pagina-caio') || 'page-home';
  showPage(ultimaPagina);
  
  carregarGaleria();

  const formUpload = document.getElementById('form-upload-inline');
  const statusUpload = document.getElementById('status-upload-inline');
  const fileInput = document.getElementById('input-foto-inline');

  if (formUpload) formUpload.addEventListener('submit', enviarDesenho);

  if (fileInput) {
    fileInput.addEventListener('change', () => {
      atualizarPreviewImagem(fileInput.files?.[0], statusUpload);
    });
  }

  const orderSelect = document.getElementById('filter-order');
  orderSelect?.addEventListener('change', aplicarFiltro);

  // Escuta para fechar o modal ao clicar no botão 'X' ou fora da janela de conteúdo
  const fecharModal = document.getElementById('fechar-modal');
  const modal = document.getElementById('foto-modal');
  
  if (fecharModal && modal) {
    fecharModal.addEventListener('click', () => {
      modal.classList.remove('open');
    });
    
    modal.addEventListener('click', (event) => {
      if (event.target === modal) {
        modal.classList.remove('open');
      }
    });
  }

  // Lógica de clique para colocar o desenho em Tela Cheia (Fullscreen API)
  const fullscreenBtn = document.getElementById('fullscreen-btn');
  const modalImg = document.getElementById('modal-img');

  if (fullscreenBtn && modalImg) {
    fullscreenBtn.addEventListener('click', (event) => {
      event.stopPropagation(); // Evita fechar o modal
      
      if (modalImg.requestFullscreen) {
        modalImg.requestFullscreen();
      } else if (modalImg.webkitRequestFullscreen) { /* Safari / iOS */
        modalImg.webkitRequestFullscreen();
      } else if (modalImg.msRequestFullscreen) { /* IE11 */
        modalImg.msRequestFullscreen();
      }
    });
  }

  // Lógica do clique para Excluir Desenho
  const btnExcluir = document.getElementById('btn-excluir-desenho');
  if (btnExcluir) {
    btnExcluir.addEventListener('click', deletarDesenhoAtivo);
  }
});