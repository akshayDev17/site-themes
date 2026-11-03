// Harness only: site-shell whose response fails after it has started streaming
// (an unguarded handler), to show what no hook can recover from.
import SiteShell from '../../worker';
import type { ComposeOptions } from '../../compose';

export default class MidstreamFaultShell extends SiteShell {
  override async compose(response: Response, opts: ComposeOptions): Promise<Response> {
    const composed = await super.compose(response, opts);
    return new HTMLRewriter()
      .on('main', {
        element() {
          throw new Error('fault: mid-stream');
        },
      })
      .transform(composed);
  }
}
