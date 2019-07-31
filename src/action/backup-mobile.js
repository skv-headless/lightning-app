/**
 * @fileOverview action to handle static channel backup (SCB) to local
 * storage options as well as to cloud storage.
 *
 * On iOS we use the fact that the keychain values are persistent between
 * app installs for local backups. If users have activated iCloud on their
 * devices the iCloud key/value store is used.
 *
 * On Android we store backups to external storage on device for local
 * backups.
 */

import { poll } from '../helper';
import * as log from './log';

const SCB_KEY = 'channel.backup';

class BackupAction {
  constructor(grpc, file, Platform, Permissions, iCloudStorage) {
    this._grpc = grpc;
    this._file = file;
    this._Platform = Platform;
    this._Permissions = Permissions;
    this._iCloudStorage = iCloudStorage;
  }

  //
  // Backup actions
  //

  async pushChannelBackup() {
    if (this._Platform.OS === 'ios') {
      await this.pushToICloud();
    } else if (this._Platform.OS === 'android') {
      await this.pushToExternalStorage();
    }
  }

  async pushToICloud() {
    try {
      const scbBase64 = await this._file.readSCB();
      await this._iCloudStorage.setItem(SCB_KEY, scbBase64);
    } catch (err) {
      log.error('Uploading channel backup to iCloud failed', err);
    }
  }

  async requestPermissionForExternalStorage() {
    const granted = await await this._Permissions.request(
      this._Permissions.PERMISSIONS.WRITE_EXTERNAL_STORAGE
    );
    return granted === this._Permissions.RESULTS.GRANTED;
  }

  async pushToExternalStorage() {
    const permission = await this.requestPermissionForExternalStorage();
    if (!permission) {
      log.info('Skipping channel backup due to missing permissions');
      return;
    }
    try {
      await this._file.copySCBToExternalStorage();
    } catch (err) {
      log.error('Copying channel backup to external storage failed', err);
    }
  }

  //
  // Restore actions
  //

  async fetchChannelBackup() {
    let scbBase64;
    if (this._Platform.OS === 'ios') {
      scbBase64 = await this.fetchFromICloud();
    } else if (this._Platform.OS === 'android') {
      scbBase64 = await this.fetchFromExternalStorage();
    }
    return scbBase64 ? Buffer.from(scbBase64, 'base64') : null;
  }

  async fetchFromICloud() {
    try {
      return this._iCloudStorage.getItem(SCB_KEY);
    } catch (err) {
      log.info(`Failed to read channel backup from iCloud: ${err.message}`);
    }
  }

  async fetchFromExternalStorage() {
    const permission = await this.requestPermissionForExternalStorage();
    if (!permission) {
      log.info('Skipping channel restore: missing storage permissions');
      return;
    }
    try {
      return this._file.readSCBFromExternalStorage();
    } catch (err) {
      log.info(`Failed to read channel backup from external: ${err.message}`);
    }
  }

  /**
   * Poll the channel backup call
   * @return {Promise<undefined>}
   */
  async pollPushChannelBackup() {
    await poll(() => this.pushChannelBackup());
  }

  /**
   * Subscribe to channel backup updates. If a new one comes in, back up the
   * latest update.
   * @return {undefined}
   */
  async subscribeChannelBackups() {
    const stream = this._grpc.sendStreamCommand('subscribeChannelBackups');
    stream.on('data', () => this.pushChannelBackup());
    stream.on('error', err => log.error('Channel backup error:', err));
    stream.on('status', status => log.info(`Channel backup status: ${status}`));
  }
}

export default BackupAction;