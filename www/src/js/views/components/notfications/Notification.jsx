// @flow

import React, { Fragment, Component } from 'react';
import { connect } from 'react-redux';
import classnames from 'classnames';

import type { State as StoreState } from 'reducers';
import type { NotificationData } from 'types/reducers';
import { popNotification } from 'actions/app';
import styles from './Notification.scss';

type Props = {
  notifications: NotificationData[],
  popNotification: () => void,
};

type State = {
  isOpen: boolean,
  shownNotification: ?NotificationData,
  actionClicked: boolean,
};

const ACTIVE_CLASSNAME = 'mdc-snackbar--active';
const DEFAULT_TIMEOUT = 2750;
const TRANSITION_DURATION = 250;

/**
 * Notification has a relatively complicated state system since its State is deliberately
 * out of step with the Redux store to ensure the transitions work properly. It is
 * implemented as a state machine with four states -
 *
 * - Closed
 *  - Wait for new notification to go to Opening
 * - Opening
 *  - Set isOpen to true to trigger transition
 *  - Go to Closing if new notification arrives
 * - Opened
 *  - Start timer at the end of which go to Closing
 *  - Go to Closing if new notification arrives
 *  - Go to Closing if action is pressed
 * - Closing
 *  - Set isOpen to false to trigger transition
 *
 * shownNotification is used to ensure the text and content of the snackbar do not
 * change when the active notification changes
 *
 * Notice we do not transition immediately from Opening or Opened to Closed
 * because we want the animation to play out to draw the user's attention to
 * the new notification.
 */
export class NotificationComponent extends Component<Props, State> {
  openTimeoutId: TimeoutID;
  closeTimeoutId: TimeoutID;

  constructor(props: Props) {
    super(props);

    this.state = {
      shownNotification: props.notifications[0],
      isOpen: !!props.notifications.length,
      actionClicked: false,
    };
  }

  shouldComponentUpdate(nextProps: Props, nextState: State) {
    return (
      nextProps.notifications[0] !== this.state.shownNotification ||
      nextState.isOpen !== this.state.isOpen
    );
  }

  componentDidUpdate() {
    const { notifications } = this.props;
    const { shownNotification, isOpen, actionClicked } = this.state;

    if (notifications[0] !== shownNotification) {
      // Active notification has changed
      if (isOpen) {
        const discarded = !notifications.includes(shownNotification);
        if (shownNotification && shownNotification.willClose) {
          shownNotification.willClose(discarded, actionClicked);
        }
        this.closeSnackbar();
      } else if (!this.transitioning) {
        this.openSnackbar();
      }
    }
  }

  onTransitionEnd = (evt: TransitionEvent) => {
    if (evt.target !== this.element.current) return;

    // the event ran, so the failsafe can be cancelled
    clearTimeout(this.closeTimeoutId);

    this.transitioning = false;

    if (this.state.isOpen && this.state.shownNotification) {
      // This is at the end of the opening transition, so we set a timer and
      // close the notification when the timer is up
      const timeout = this.state.shownNotification.timeout || DEFAULT_TIMEOUT;
      clearTimeout(this.openTimeoutId); // Defensive
      this.openTimeoutId = setTimeout(() => this.props.popNotification(), timeout);
    } else if (this.props.notifications.length) {
      // End of closing transition - if there are more notifications, let's show them
      this.openSnackbar();
    }
  };

  element = React.createRef<HTMLDivElement>();
  transitioning: boolean = false;

  openSnackbar = () => {
    this.transitioning = true;
    this.setState({
      isOpen: true,
      shownNotification: this.props.notifications[0],
      actionClicked: false,
    });
  };

  clearTransition = () => {
    this.transitioning = false;
  };

  closeSnackbar = () => {
    this.transitioning = true;
    this.setState({ isOpen: false });
    // onTransitionEnd can be cancelled, causing transitioning to never
    // turn false and notifications to stop showing up, so we set a timer
    // and turn transitioning false when the timer is up
    clearTimeout(this.closeTimeoutId); // Defensive
    this.closeTimeoutId = setTimeout(() => this.clearTransition(), TRANSITION_DURATION);
  };

  render() {
    const { shownNotification, isOpen } = this.state;

    return (
      <div
        className={classnames('mdc-snackbar', styles.snackbar, {
          [ACTIVE_CLASSNAME]: isOpen,
        })}
        aria-live="assertive"
        aria-atomic="true"
        aria-hidden={!!shownNotification}
        onTransitionEnd={this.onTransitionEnd}
        ref={this.element}
      >
        {!!shownNotification && (
          <Fragment>
            <div className="mdc-snackbar__text">{shownNotification.message}</div>
            {shownNotification.action && (
              <div className="mdc-snackbar__action-wrapper">
                <button
                  type="button"
                  className="mdc-snackbar__action-button"
                  onClick={() => {
                    this.setState({ actionClicked: true });
                    const { handler } = shownNotification.action || {};
                    // Don't auto-close if handler returns false
                    if (handler && handler() === false) return;
                    this.props.popNotification();
                  }}
                >
                  {shownNotification.action.text}
                </button>
              </div>
            )}
          </Fragment>
        )}
      </div>
    );
  }
}

export default connect(
  (state: StoreState) => ({
    notifications: state.app.notifications,
  }),
  { popNotification },
)(NotificationComponent);
