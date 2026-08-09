const urls = ['http://localhost:3000/admin/configurar', 'http://localhost:3000/admin/chaveamento'];
(async () => {
  for (const url of urls) {
    try {
      const res = await fetch(url);
      const html = await res.text();
      console.log(`=== ${url} ===`);
      console.log('status:', res.status);
      console.log('contains title configurar:', /Configurar Prazos/.test(html));
      console.log('contains catalogo esportes:', /Gerenciar Catálogo de Esportes/.test(html));
      console.log('contains modalidades list:', /class="modalidades-list"/.test(html));
      console.log('contains modalidade icon:', /modalidade-icon/.test(html));
      console.log('contains admin chaveamento link:', /href="\/admin\/chaveamento\?modalidade=/.test(html));
      console.log('contains chaveamento title:', /Chaveamento dos Jogos/.test(html));
      console.log('contains menu-modalidades:', /menu-modalidades/.test(html));
      console.log('contains sport icon img tags:', /<img[^>]+class=".*modalidade-icon.*"|<img[^>]+src="[^"]+"[^>]*>/.test(html));
      const countIcons = (html.match(/<img[^>]+src="[^"]+"/g)||[]).length;
      console.log('img tags count:', countIcons);
      const countModItems = (html.match(/class="modalidade-item"/g)||[]).length;
      console.log('modalidade-item count:', countModItems);
      console.log();
    } catch (err) {
      console.error('ERROR', url, err.message);
    }
  }
})();
