import { forwardRef } from 'react'

/** Virtuoso scroll container — coach scrollbar styles applied via CSS on data attribute */
export const CoachChatVirtuosoScroller = forwardRef(function CoachChatVirtuosoScroller(props, ref) {
  return <div {...props} ref={ref} data-coach-virtuoso-scroller="" />
})

/** Virtuoso list root — column layout aligned with legacy .coach-thread */
export const CoachChatVirtuosoList = forwardRef(function CoachChatVirtuosoList(props, ref) {
  const { className = '', ...rest } = props
  return <div {...rest} ref={ref} className={`coach-virtuoso-list ${className}`.trim()} />
})

export const CoachChatVirtuosoItem = forwardRef(function CoachChatVirtuosoItem(props, ref) {
  const { className = '', ...rest } = props
  return <div {...rest} ref={ref} className={`coach-virtuoso-item ${className}`.trim()} />
})
