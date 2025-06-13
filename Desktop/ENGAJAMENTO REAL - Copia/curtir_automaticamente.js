// Script para curtir automaticamente um post (simulando clique no botão)
// Use este script no console do navegador na página do post do Instagram

function curtirAutomaticamente() {
    // Seletor baseado nas classes fornecidas
    const botaoCurtir = document.querySelector('div.x1i10hfl.x972fbf.xcfux6l.x1qhh985.xm0m39n.x9f619.xe8uvvx.xdj266r.x11i5rnm.xat24cr.x1mh8g0r.x16tdsg8.x1hl2dhg.xggy1nq.x1a2a7pz.x6s0dn4.xjbqb8w.x1ejq31n.xd10rxx.x1sy0etr.x17r0tee.x1ypdohk.x78zum5.xl56j7k.x1y1aw1k.x1sxyh0.xwib8y2.xurb0ha.xcdnw81[role="button"]');
    if (botaoCurtir) {
        // Só clica se o botão estiver visível e não estiver já curtido
        // Você pode adaptar a lógica para checar o texto ou estado
        botaoCurtir.click();
        console.log('Post curtido automaticamente!');
    } else {
        console.log('Botão de curtir não encontrado.');
    }
}

// Executa automaticamente ao carregar o script
curtirAutomaticamente();
