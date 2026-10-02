type MenuToggleIconProps = {
  open: boolean;
};

export function MenuToggleIcon({ open }: MenuToggleIconProps) {
  return (
    <span className="swiss-menu-icon" data-open={open} aria-hidden="true">
      <span className="swiss-menu-icon-bar swiss-menu-icon-bar-top" />
      <span className="swiss-menu-icon-bar swiss-menu-icon-bar-middle" />
      <span className="swiss-menu-icon-bar swiss-menu-icon-bar-bottom" />
    </span>
  );
}
