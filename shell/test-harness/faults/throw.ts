// Harness only: site-shell whose compose() rejects, to prove the app hook fails open.
import SiteShell from '../../worker';

export default class ThrowingShell extends SiteShell {
  override async compose(): Promise<Response> {
    throw new Error('fault: compose threw');
  }
}
