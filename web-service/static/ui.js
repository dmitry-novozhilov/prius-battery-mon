const cellsCnt = 28;

function gebi( id ) { return document.getElementById( id ) }

function log(text, data) {
    let log = gebi('log');
    log.innerText += `${text} ${JSON.stringify(data)}`+"\n";
}

function initTable() {
    gauges = gebi('gauges');
    gauges.replaceChildren();
    gauges.createTHead()
    // gauges.createTFoot()
    const thr = gauges.tHead.insertRow();
    // const tfr = gauges.tFoot.insertRow();
    for(let i=0; i < cellsCnt; i++) {
        let c = thr.insertCell();
        c.innerText = i+1;
        // c = tfr.insertCell();
        // c.innerText = i+1;
    }
}

let lastRow;

function exportLastRow() {
    const row = [];
    for(i=0; i<lastRow.cells.length; i++) {
        row[i]=lastRow.cells[i].innerText * 1;
    }
    fetch(window.location.pathname, {
        method: 'POST',
        body: row.join("\t"),
    })
}

function tableAddCell(cellNumber, value) {
    gauges = gebi('gauges');
    if(cellNumber===0) {
        if(lastRow !== undefined)
            exportLastRow();
        lastRow = gauges.insertRow();
        for(i=0; i<cellsCnt; i++) {
            let c = lastRow.insertCell();
            c.innerText = '?';
        }
        lastRow.scrollIntoView();
    }
    lastRow.cells[cellNumber].innerText = value.toFixed(1);
    let hue = value < 0 ? 220
        : value < 25 ? (25-value)/25*90+120
        : value < 50 ? (25-(value-25))/25*120
        : 0
    lastRow.cells[cellNumber].style.backgroundColor = `hsl(${hue} 100% 50%)`;
}

function startApp() {
    try {
        startBLE().catch(e => log('BLE failed', e.message))
    } catch (e) {
        log(`error`, e.message)
    }
}

async function startBLE() {
    const opts = {
        filters: [{ name: ['Prius-battery-mon'] }],
        // filters: [{ services: ['4fafc201-1fb5-459e-8fcc-c5c9c331914b'] }],
        // acceptAllDevices: true,
        // optionalServices: ['4fafc201-1fb5-459e-8fcc-c5c9c331914b'],
    };
    log('opts', opts);
    const device = await navigator.bluetooth.requestDevice(opts);
    log('device', device);
    const server = await device.gatt.connect();
    log('server', server);
    const service = await server.getPrimaryService('4fafc201-1fb5-459e-8fcc-c5c9c331914b');
    log('service', service);
    const characteristic = await service.getCharacteristic('beb5483e-36e1-4688-b7f5-ea07361b26a8');
    log('characteristic', characteristic);
    
    characteristic.startNotifications();
    characteristic.addEventListener('characteristicvaluechanged', (event) => {
        let data = new TextDecoder().decode(event.target.value);
        data = JSON.parse(data);
        tableAddCell(data.cell, data.temp);
    });
}

function emulate() {
    setInterval(function(){
        for(let i=0; i<cellsCnt; i++) {
            tableAddCell(i, Math.random() * 55);
        }
    }, 1000);
}

window.addEventListener( 'error', ( message, url, lineNo, columnNo, error ) => log( 'window.error', { message, url, lineNo, columnNo, error } ) );
window.addEventListener( 'load', e => initTable() );
