/**
 * @fileOverview actions wrapping file I/O operations on mobile.
 */

import * as log from './log';

class FileAction {
  constructor(store, FS, Share, iCloud) {
    this._store = store;
    this._FS = FS;
    this._Share = Share;
    this._iCloud = iCloud;
  }

  /**
   * Gets the path of the lnd directory where `logs` and `data` are stored.
   * @return {string}
   */
  getLndDir() {
    return this._FS.DocumentDirectoryPath;
  }

  /**
   * Retrieves the entire lnd log file contents as a string.
   * @return {Promise<string>}
   */
  async readLogs() {
    const { network } = this._store;
    const path = `${this.getLndDir()}/logs/bitcoin/${network}/lnd.log`;
    return this._FS.readFile(path, 'utf8');
  }

  /**
   * Shares the log file using whatever native share function we have.
   * @return {Promise}
   */
  async shareLogs() {
    try {
      const logs = await this.readLogs();
      await this._Share.share({
        title: 'Lightning App logs',
        message: logs,
      });
    } catch (err) {
      log.error('Exporting logs failed', err);
    }
  }

  /**
   * Check whether iCloud contains a channel backup for the user. If one is found,
   * save it in the store.
   * @return {Promise<undefined>}
   */
  async checkForChannelBackup() {
    try {
      let backup = await this._iCloud.getItem('channel.backup');
      if (backup) {
        this._store.channelBackup = {
          multiChanBackup: {
            multiChanBackup: backup,
          },
        };
      }
    } catch (err) {
      log.error('Fetching iCloud channel backup failed', err);
    }
  }

  /**
   * Save channel.backup to iCloud.
   * @return {Promise<undefined>}
   */
  async backUpChannelsFromFS() {
    const { network } = this._store;
    const path = `${this.getLndDir()}/data/chain/bitcoin/${network}/channel.backup`;
    let backup = await this._FS.readFile(path, 'base64');
    await this.saveToICloud({ key: 'channel.backup', value: backup });
  }

  /**
   * Save arbitrary key-value data to iCloud.
   * @param  {string} options.key   The key to store
   * @param  {string} options.value The value to store
   * @return {Promise<undefined>}
   */
  async saveToICloud({ key, value }) {
    try {
      await this._iCloud.setItem(key, value);
    } catch (err) {
      log.error(`Saving ${key} to iCloud failed.`, err);
    }
  }

  /**
   * Delete the wallet.db file. This allows the user to restore their wallet
   * (including channel state) from the seed if they've forgotten the pin.
   * @return {Promise<undefined>}
   */
  async deleteWalletDB(network) {
    const path = `${this.getLndDir()}/data/chain/bitcoin/${network}/wallet.db`;
    try {
      await this._FS.unlink(path);
    } catch (err) {
      log.info(`No ${network} wallet to delete.`);
    }
  }
}

export default FileAction;
