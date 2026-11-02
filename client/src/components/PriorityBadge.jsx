import { PRIORITY_STYLES } from '../constants';

export default function PriorityBadge({ priority }) {
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold ${PRIORITY_STYLES[priority]}`}
    >
      {priority}
    </span>
  );
}
