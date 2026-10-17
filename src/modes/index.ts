// §3.2: 新しいモードは、ここに1行 register を足すだけで、メニューと集計に反映される
import { GameRegistry } from '../core/registry';
import { ParityMode } from './parity/ParityMode';
import { RodsMode } from './rods/RodsMode';
import { TenFrameMode } from './tenframe/TenFrameMode';
import { ExchangeMode } from './exchange/ExchangeMode';

let done = false;
export function registerModes() {
  if (done) return;
  done = true;
  GameRegistry.register(ParityMode);
  GameRegistry.register(RodsMode);
  GameRegistry.register(TenFrameMode);
  GameRegistry.register(ExchangeMode);
}
