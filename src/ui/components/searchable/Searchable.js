/**
 * Copyright 2018-present Facebook.
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 * @format
 */

import type {Filter} from 'flipper';
import type {TableColumns} from '../table/types';
import {PureComponent} from 'react';
import Toolbar from '../Toolbar.js';
import FlexRow from '../FlexRow.js';
import Input from '../Input.js';
import {colors} from '../colors.js';
import Text from '../Text.js';
import FlexBox from '../FlexBox.js';
import Glyph from '../Glyph.js';
import FilterToken from './FilterToken.js';
import styled from '../../styled/index.js';
import debounce from 'lodash.debounce';

const SearchBar = styled(Toolbar)({
  height: 42,
  padding: 6,
});

export const SearchBox = styled(FlexBox)({
  backgroundColor: colors.white,
  borderRadius: '999em',
  border: `1px solid ${colors.light15}`,
  height: '100%',
  width: '100%',
  alignItems: 'center',
  paddingLeft: 4,
});

export const SearchInput = styled(Input)(props => ({
  border: props.focus ? '1px solid black' : 0,
  padding: 0,
  fontSize: '1em',
  flexGrow: 1,
  height: 'auto',
  lineHeight: '100%',
  marginLeft: 2,
  width: '100%',
  '&::-webkit-input-placeholder': {
    color: colors.placeholder,
    fontWeight: 300,
  },
}));

const Clear = styled(Text)({
  position: 'absolute',
  right: 6,
  top: '50%',
  marginTop: -9,
  fontSize: 16,
  width: 17,
  height: 17,
  borderRadius: 999,
  lineHeight: '15.5px',
  textAlign: 'center',
  backgroundColor: 'rgba(0,0,0,0.1)',
  color: colors.white,
  display: 'block',
  '&:hover': {
    backgroundColor: 'rgba(0,0,0,0.15)',
  },
});

export const SearchIcon = styled(Glyph)({
  marginRight: 3,
  marginLeft: 3,
  marginTop: -1,
  minWidth: 16,
});

const Actions = styled(FlexRow)({
  marginLeft: 8,
  flexShrink: 0,
});

export type SearchableProps = {|
  addFilter: (filter: Filter) => void,
  searchTerm: string,
  filters: Array<Filter>,
|};

type Props = {|
  placeholder?: string,
  actions: React.Node,
  tableKey: string,
  columns?: TableColumns,
  onFilterChange: (filters: Array<Filter>) => void,
  defaultFilters: Array<Filter>,
|};

type State = {
  filters: Array<Filter>,
  focusedToken: number,
  searchTerm: string,
  hasFocus: boolean,
};

const Searchable = (
  Component: React.ComponentType<any>,
): React.ComponentType<any> =>
  class extends PureComponent<Props, State> {
    static defaultProps = {
      placeholder: 'Search...',
    };

    state: State = {
      filters: this.props.defaultFilters || [],
      focusedToken: -1,
      searchTerm: '',
      hasFocus: false,
    };

    _inputRef: ?HTMLInputElement;

    componentDidMount() {
      window.document.addEventListener('keydown', this.onKeyDown);
      const {defaultFilters} = this.props;
      let savedState;

      if (this.getTableKey()) {
        try {
          savedState = JSON.parse(
            window.localStorage.getItem(this.getPersistKey()) || 'null',
          );
        } catch (e) {
          window.localStorage.removeItem(this.getPersistKey());
        }
      }

      if (savedState) {
        if (defaultFilters != null) {
          // merge default filter with persisted filters
          const savedStateFilters = savedState.filters;
          defaultFilters.forEach(defaultFilter => {
            const filterIndex = savedStateFilters.findIndex(
              f => f.key === defaultFilter.key,
            );
            if (filterIndex > -1) {
              if (defaultFilter.type === 'enum') {
                savedStateFilters[filterIndex].enum = defaultFilter.enum;
              }
              const filters = new Set(
                savedStateFilters[filterIndex].enum.map(filter => filter.value),
              );
              savedStateFilters[filterIndex].value = savedStateFilters[
                filterIndex
              ].value.filter(value => filters.has(value));
            }
          });
        }
        this.setState({
          searchTerm: savedState.searchTerm || this.state.searchTerm,
          filters: savedState.filters || this.state.filters,
        });
      }
    }

    componentDidUpdate(prevProps: Props, prevState: State) {
      if (
        this.getTableKey() &&
        (prevState.searchTerm !== this.state.searchTerm ||
          prevState.filters !== this.state.filters)
      ) {
        window.localStorage.setItem(
          this.getPersistKey(),
          JSON.stringify({
            searchTerm: this.state.searchTerm,
            filters: this.state.filters,
          }),
        );
        if (this.props.onFilterChange != null) {
          this.props.onFilterChange(this.state.filters);
        }
      } else if (prevProps.defaultFilters !== this.props.defaultFilters) {
        const mergedFilters = [...this.state.filters];
        this.props.defaultFilters.forEach((defaultFilter: Filter) => {
          const filterIndex = mergedFilters.findIndex(
            (f: Filter) => f.key === defaultFilter.key,
          );
          if (filterIndex > -1) {
            mergedFilters[filterIndex] = defaultFilter;
          } else {
            mergedFilters.push(defaultFilter);
          }
        });
        this.setState({
          filters: mergedFilters,
        });
      }
    }

    componentWillUnmount() {
      window.document.removeEventListener('keydown', this.onKeyDown);
    }

    getTableKey = (): ?string => {
      if (this.props.tableKey) {
        return this.props.tableKey;
      } else if (this.props.columns) {
        // if we have a table, we are using it's colums to uniquely identify
        // the table (in case there is more than one table rendered at a time)
        return (
          'TABLE_COLUMNS_' +
          Object.keys(this.props.columns)
            .join('_')
            .toUpperCase()
        );
      }
    };

    onKeyDown = (e: SyntheticKeyboardEvent<>) => {
      const ctrlOrCmd = e =>
        (e.metaKey && process.platform === 'darwin') ||
        (e.ctrlKey && process.platform !== 'darwin');

      if (e.key === 'f' && ctrlOrCmd(e) && this._inputRef) {
        e.preventDefault();
        if (this._inputRef) {
          this._inputRef.focus();
        }
      } else if (e.key === 'Escape' && this._inputRef) {
        this._inputRef.blur();
        this.setState({searchTerm: ''});
      } else if (e.key === 'Backspace' && this.hasFocus()) {
        if (
          this.state.focusedToken === -1 &&
          this.state.searchTerm === '' &&
          this._inputRef &&
          !this.state.filters[this.state.filters.length - 1].persistent
        ) {
          this._inputRef.blur();
          this.setState({focusedToken: this.state.filters.length - 1});
        } else {
          this.removeFilter(this.state.focusedToken);
        }
      } else if (
        e.key === 'Delete' &&
        this.hasFocus() &&
        this.state.focusedToken > -1
      ) {
        this.removeFilter(this.state.focusedToken);
      } else if (e.key === 'Enter' && this.hasFocus() && this._inputRef) {
        this.matchTags(this._inputRef.value, true);
      }
    };

    onChangeSearchTerm = (e: SyntheticInputEvent<HTMLInputElement>) => {
      this.setState({searchTerm: e.target.value});
      this.matchTags(e.target.value, false);
    };

    matchTags = debounce((searchTerm: string, matchEnd: boolean) => {
      const filterPattern = matchEnd
        ? /([a-z][a-z0-9]*[!]?[:=][^\s]+)($|\s)/gi
        : /([a-z][a-z0-9]*[!]?[:=][^\s]+)\s/gi;
      const match = searchTerm.match(filterPattern);
      if (match && match.length > 0) {
        match.forEach((filter: string) => {
          const separator =
            filter.indexOf(':') > filter.indexOf('=') ? ':' : '=';
          let [key, ...value] = filter.split(separator);
          value = value.join(separator).trim();
          let type = 'include';
          // if value starts with !, it's an exclude filter
          if (value.indexOf('!') === 0) {
            type = 'exclude';
            value = value.substring(1);
          }
          // if key ends with !, it's an exclude filter
          if (key.indexOf('!') === key.length - 1) {
            type = 'exclude';
            key = key.slice(0, -1);
          }
          this.addFilter({
            type,
            key,
            value,
          });
        });

        searchTerm = searchTerm.replace(filterPattern, '');
      }
    }, 200);

    setInputRef = (ref: ?HTMLInputElement) => {
      this._inputRef = ref;
    };

    addFilter = (filter: Filter) => {
      const filterIndex = this.state.filters.findIndex(
        f => f.key === filter.key,
      );
      if (filterIndex > -1) {
        const filters = [...this.state.filters];
        const defaultFilter: Filter = this.props.defaultFilters[filterIndex];
        if (
          defaultFilter != null &&
          defaultFilter.type === 'enum' &&
          filters[filterIndex].type === 'enum'
        ) {
          filters[filterIndex].enum = defaultFilter.enum;
        }
        this.setState({filters});
        // filter for this key already exists
        return;
      }
      // persistent filters are always at the front
      const filters =
        filter.persistent === true
          ? [filter, ...this.state.filters]
          : this.state.filters.concat(filter);
      this.setState({
        filters,
        focusedToken: -1,
      });
    };

    removeFilter = (index: number) => {
      const filters = this.state.filters.filter((_, i) => i !== index);
      const focusedToken = -1;
      this.setState({filters, focusedToken}, () => {
        if (this._inputRef) {
          this._inputRef.focus();
        }
      });
    };

    replaceFilter = (index: number, filter: Filter) => {
      const filters = [...this.state.filters];
      filters.splice(index, 1, filter);
      this.setState({filters});
    };

    onInputFocus = () =>
      this.setState({
        focusedToken: -1,
        hasFocus: true,
      });

    onInputBlur = () =>
      setTimeout(
        () =>
          this.setState({
            hasFocus: false,
          }),
        100,
      );

    onTokenFocus = (focusedToken: number) => this.setState({focusedToken});

    onTokenBlur = () => this.setState({focusedToken: -1});

    hasFocus = (): boolean => {
      return this.state.focusedToken !== -1 || this.state.hasFocus;
    };

    clear = () =>
      this.setState({
        filters: this.state.filters.filter(
          f => f.persistent != null && f.persistent === true,
        ),
        searchTerm: '',
      });

    getPersistKey = () => `SEARCHABLE_STORAGE_KEY_${this.getTableKey() || ''}`;

    render(): React.Node {
      const {placeholder, actions, ...props} = this.props;
      return [
        <SearchBar position="top" key="searchbar">
          <SearchBox tabIndex={-1}>
            <SearchIcon
              name="magnifying-glass"
              color={colors.macOSTitleBarIcon}
              size={16}
            />
            {this.state.filters.map((filter, i) => (
              <FilterToken
                key={`${filter.key}:${filter.type}`}
                index={i}
                filter={filter}
                focused={i === this.state.focusedToken}
                onFocus={this.onTokenFocus}
                onDelete={this.removeFilter}
                onReplace={this.replaceFilter}
                onBlur={this.onTokenBlur}
              />
            ))}
            <SearchInput
              placeholder={placeholder}
              onChange={this.onChangeSearchTerm}
              value={this.state.searchTerm}
              innerRef={this.setInputRef}
              onFocus={this.onInputFocus}
              onBlur={this.onInputBlur}
            />
            {(this.state.searchTerm || this.state.filters.length > 0) && (
              <Clear onClick={this.clear}>&times;</Clear>
            )}
          </SearchBox>
          {actions != null && <Actions>{actions}</Actions>}
        </SearchBar>,
        <Component
          {...props}
          key="table"
          addFilter={this.addFilter}
          searchTerm={this.state.searchTerm}
          filters={this.state.filters}
        />,
      ];
    }
  };

/**
 * Higher-order-component that allows adding a searchbar on top of the wrapped
 * component. See SearchableManagedTable for usage with a table.
 */
export default Searchable;
