import type { RemoveCopy } from '../../config/site';
import type { AlbumMedia } from '../../lib/types';
import { ConfirmDialog } from './ConfirmDialog';

interface Props {
  item: AlbumMedia;
  onConfirm: () => void;
  onCancel: () => void;
  copy: RemoveCopy;
}

/** "Delete this photo?" — Yes or No, with the item itself shown (owner request). */
export function ConfirmRemove({ item, onConfirm, onCancel, copy }: Props) {
  return (
    <ConfirmDialog
      question={item.kind === 'video' ? copy.questionVideo : copy.questionPhoto}
      detail={copy.detail}
      yes={copy.yes}
      no={copy.no}
      image={{ src: item.src, alt: item.alt }}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}
