import { withElectronPage } from './cdp.js';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  return await withElectronPage(async (page) => {
    await page.evaluate("(function(){var items=document.querySelectorAll('.sidenav-item');for(var i=0;i<items.length;i++){if((items[i].innerText||'').trim()==='日程会议'){items[i].click();break;}}})()");
    await sleep(2000);
    await page.evaluate("(function(){document.body.click();document.body.click();})()");
    await sleep(1000);

    await page.evaluate("(function(){var btns=document.querySelectorAll('button');for(var i=0;i<btns.length;i++){if((btns[i].innerText||'').trim()==='月'){btns[i].click();break;}}})()");
    await sleep(2000);

    await page.evaluate("(function(){var cells=document.querySelectorAll('.fc-daygrid-day-number,.fc-day-number');for(var i=0;i<cells.length;i++){if((cells[i].innerText||'').trim()==='23'){cells[i].click();break;}}})()");
    await sleep(1500);

    // Click the event title directly
    const clickR = await page.evaluate("(function(){var days=document.querySelectorAll('.fc-daygrid-day');for(var i=0;i<days.length;i++){var num=days[i].querySelector('.fc-daygrid-day-number,.fc-day-number');if(num&&(num.innerText||'').trim()==='23'){var titles=days[i].querySelectorAll('.fc-event-title');for(var j=0;j<titles.length;j++){var t=(titles[j].innerText||'').trim();if(t.indexOf('Agentic DevOps')>-1){titles[j].click();return'clicked['+j+'] title:'+t;}}}return'not-found';})()");
    console.log('Title click:', clickR);
    await sleep(3000);

    const allD = await page.evaluate("(function(){var r=[];var d=document.querySelector('.el-drawer__body');if(d){var text=d.innerText||'';if(text.trim())r.push('drawer: '+text.substring(0,800));}var pop=document.querySelector('.el-popper');if(pop){var text=pop.innerText||'';if(text.trim())r.push('popper: '+text.substring(0,200));}var modal=document.querySelector('.el-dialog__wrapper');if(modal){var text=modal.innerText||'';if(text.trim())r.push('modal: '+text.substring(0,300));}return r.length>0?r.join('\n'):'nothing';})()");
    console.log('Dialogs:', allD);

    if (allD.indexOf('drawer:') >= 0) {
      if (allD.indexOf('01:30') >= 0) {
        console.log('=== OLD EVENT (01:30) ===');
      } else {
        console.log('\n=== NEW EVENT DETAIL ===');
      }
      console.log(allD);
      console.log('Has edit:', allD.indexOf('编辑') >= 0, 'Has delete:', allD.indexOf('删除') >= 0);
    } else {
      console.log('No drawer — trying span click');
      const click2 = await page.evaluate("(function(){var spans=document.querySelectorAll('span');for(var i=0;i<spans.length;i++){var t=(spans[i].innerText||'').trim();if(t==='Agentic DevOps 技术方案沟通'){spans[i].click();return'clicked span: '+i;}}return'not-found';})()");
      console.log('Span click:', click2);
      await sleep(3000);
      const allD2 = await page.evaluate("(function(){var r=[];var d=document.querySelector('.el-drawer__body');if(d){r.push('drawer: '+d.innerText.substring(0,800));}return r.length>0?r.join('\n'):'nothing';})()");
      console.log('After span click:', allD2);
    }
  });
}

main().catch(e => console.error(e.message));
