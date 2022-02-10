import React, { useState } from "react";
import PropTypes from "prop-types";
import MenuPanel from "terriajs/lib/ReactViews/StandardUserInterface/customizable/MenuPanel.jsx";
import PanelStyles from "terriajs/lib/ReactViews/Map/Panels/panel.scss";
import Styles from "./related-maps.scss";
import classNames from "classnames";
import DatePicker from "react-datepicker";

function SearchByDay(props) {
  const [startDate, setStartDate] = useState(new Date());
  const dropdownTheme = {
    inner: Styles.dropdownInner,
    icon: "search"
  };

  const { viewState } = props;

  console.log("Search By Day - search state", viewState.searchState);

  const convertDateToString = date => {
    let dd = String(date.getDate()).padStart(2, "0");
    let mm = String(date.getMonth() + 1).padStart(2, "0"); //January is 0!
    let yyyy = date.getFullYear();

    return mm + "-" + dd + "-" + yyyy;
    // return mm + '/' + dd + '/' + yyyy;
  };

  const searchByDate = () => {
    const searchBy = "date";
    viewState.searchState.searchCatalog(searchBy);
  };

  const onDateChanged = date => {
    setStartDate(date);
    console.log("date", convertDateToString(date));
    viewState.changeSearchState(convertDateToString(date));
    searchByDate();
    viewState.setTopElement("AddData");
    viewState.openAddData();
  };

  return (
    <MenuPanel
      theme={dropdownTheme}
      // changed to Search by Date vs Day???
      btnText="Search By Date"
      smallScreen={props.smallScreen}
      viewState={props.viewState}
      btnTitle="See related maps"
      showDropdownInCenter
    >
      <div className={classNames(PanelStyles.header)}>
        <label className={PanelStyles.heading}>Search by Date</label>
      </div>
      <DatePicker
        showMonthDropdown
        showYearDropdown
        scrollableYearDropdown
        selected={startDate}
        onChange={date => onDateChanged(date)}
        // onChange={date => setStartDate(date)}
      />
    </MenuPanel>
  );
}
SearchByDay.propTypes = {
  viewState: PropTypes.object.isRequired,
  smallScreen: PropTypes.bool
};
export default SearchByDay;
