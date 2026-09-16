import { bootstrap } from '@renderer/shared/bootstrap'
import { App } from '@renderer/main/App'
import { installMobileBridge } from './bridge'

// The bridge has to be on window.sonora before bootstrap wires the stores to it.
void installMobileBridge().then(() => bootstrap(<App />))
