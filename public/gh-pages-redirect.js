(()=>{const p=new URLSearchParams(location.search).get('p');if(p){history.replaceState(null,'',p);sessionStorage.removeItem('redirect')}})();
