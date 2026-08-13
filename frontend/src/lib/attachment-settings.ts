import { AttachmentLocation } from "../../bindings/github.com/kazuph/obails/models/models.js";

export type AttachmentLocationOption = {
  value: string;
  label: string;
};

export const ATTACHMENT_LOCATION_OPTIONS: readonly AttachmentLocationOption[] = [
  { value: AttachmentLocation.AttachmentLocationVaultRoot, label: "Vault root" },
  { value: AttachmentLocation.AttachmentLocationVaultFolder, label: "Specified vault folder" },
  { value: AttachmentLocation.AttachmentLocationCurrentFolder, label: "Current note folder" },
  { value: AttachmentLocation.AttachmentLocationCurrentSubfolder, label: "Subfolder under current note" },
];

export function attachmentLocationNeedsFolder(location: string): boolean {
  return location === AttachmentLocation.AttachmentLocationVaultFolder
    || location === AttachmentLocation.AttachmentLocationCurrentSubfolder;
}
