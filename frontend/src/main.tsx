import { render } from 'preact';
import { App } from './app';
import { registerServiceWorker } from './sw-register';
import './styles.css';

render(<App />, document.getElementById('app')!);
registerServiceWorker();
