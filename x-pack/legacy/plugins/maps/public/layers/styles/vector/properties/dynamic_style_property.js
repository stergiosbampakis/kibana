/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License;
 * you may not use this file except in compliance with the Elastic License.
 */

import _ from 'lodash';
import { AbstractStyleProperty } from './style_property';
import { DEFAULT_SIGMA } from '../vector_style_defaults';
import {
  COLOR_PALETTE_MAX_SIZE,
  STYLE_TYPE,
  SOURCE_META_ID_ORIGIN,
  FIELD_ORIGIN,
} from '../../../../../common/constants';
import { scaleValue, getComputedFieldName } from '../style_util';
import React from 'react';
import { OrdinalLegend } from './components/ordinal_legend';
import { CategoricalLegend } from './components/categorical_legend';
import { OrdinalFieldMetaOptionsPopover } from '../components/ordinal_field_meta_options_popover';

export class DynamicStyleProperty extends AbstractStyleProperty {
  static type = STYLE_TYPE.DYNAMIC;

  constructor(options, styleName, field, vectorLayer, getFieldFormatter) {
    super(options, styleName);
    this._field = field;
    this._layer = vectorLayer;
    this._getFieldFormatter = getFieldFormatter;
  }

  getValueSuggestions = query => {
    const field = this.getField();
    const fieldSource = this.getFieldSource();
    return fieldSource && field ? fieldSource.getValueSuggestions(field, query) : [];
  };

  _getStyleMetaDataRequestId(fieldName) {
    if (this.getFieldOrigin() === FIELD_ORIGIN.SOURCE) {
      return SOURCE_META_ID_ORIGIN;
    }

    const join = this._layer.getValidJoins().find(join => {
      return join.getRightJoinSource().hasMatchingMetricField(fieldName);
    });
    return join ? join.getSourceMetaDataRequestId() : null;
  }

  getRangeFieldMeta() {
    const style = this._layer.getStyle();
    const styleMeta = style.getStyleMeta();
    const fieldName = this.getFieldName();
    const rangeFieldMetaFromLocalFeatures = styleMeta.getRangeFieldMetaDescriptor(fieldName);

    const dataRequestId = this._getStyleMetaDataRequestId(fieldName);
    if (!dataRequestId) {
      return rangeFieldMetaFromLocalFeatures;
    }

    const styleMetaDataRequest = this._layer.findDataRequestById(dataRequestId);
    if (!styleMetaDataRequest || !styleMetaDataRequest.hasData()) {
      return rangeFieldMetaFromLocalFeatures;
    }

    const data = styleMetaDataRequest.getData();
    const rangeFieldMeta = this.pluckOrdinalStyleMetaFromFieldMetaData(data);
    return rangeFieldMeta ? rangeFieldMeta : rangeFieldMetaFromLocalFeatures;
  }

  getCategoryFieldMeta() {
    const style = this._layer.getStyle();
    const styleMeta = style.getStyleMeta();
    const fieldName = this.getFieldName();
    const rangeFieldMetaFromLocalFeatures = styleMeta.getCategoryFieldMetaDescriptor(fieldName);

    const dataRequestId = this._getStyleMetaDataRequestId(fieldName);
    if (!dataRequestId) {
      return rangeFieldMetaFromLocalFeatures;
    }

    const styleMetaDataRequest = this._layer.findDataRequestById(dataRequestId);
    if (!styleMetaDataRequest || !styleMetaDataRequest.hasData()) {
      return rangeFieldMetaFromLocalFeatures;
    }

    const data = styleMetaDataRequest.getData();
    const rangeFieldMeta = this.pluckCategoricalStyleMetaFromFieldMetaData(data);
    return rangeFieldMeta ? rangeFieldMeta : rangeFieldMetaFromLocalFeatures;
  }

  getField() {
    return this._field;
  }

  getFieldSource() {
    return this._field ? this._field.getSource() : null;
  }

  getFieldName() {
    return this._field ? this._field.getName() : '';
  }

  getComputedFieldName() {
    if (!this.isComplete()) {
      return null;
    }
    return getComputedFieldName(this._styleName, this.getField().getName());
  }

  isDynamic() {
    return true;
  }

  isOrdinal() {
    return true;
  }

  isCategorical() {
    return false;
  }

  hasOrdinalBreaks() {
    return false;
  }

  isOrdinalRanged() {
    return true;
  }

  isComplete() {
    return !!this._field;
  }

  getFieldOrigin() {
    return this._field.getOrigin();
  }

  isFieldMetaEnabled() {
    const fieldMetaOptions = this.getFieldMetaOptions();
    return this.supportsFieldMeta() && _.get(fieldMetaOptions, 'isEnabled', true);
  }

  supportsFieldMeta() {
    if (this.isOrdinal()) {
      return this.isComplete() && this.isOrdinalScaled() && this._field.supportsFieldMeta();
    } else if (this.isCategorical()) {
      return this.isComplete() && this._field.supportsFieldMeta();
    } else {
      return false;
    }
  }

  async getFieldMetaRequest() {
    if (this.isOrdinal()) {
      return this._field.getOrdinalFieldMetaRequest();
    } else if (this.isCategorical()) {
      return this._field.getCategoricalFieldMetaRequest();
    } else {
      return null;
    }
  }

  supportsFeatureState() {
    return true;
  }

  isOrdinalScaled() {
    return true;
  }

  getFieldMetaOptions() {
    return _.get(this.getOptions(), 'fieldMetaOptions', {});
  }

  pluckOrdinalStyleMetaFromFeatures(features) {
    if (!this.isOrdinal()) {
      return null;
    }

    const name = this.getField().getName();
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < features.length; i++) {
      const feature = features[i];
      const newValue = parseFloat(feature.properties[name]);
      if (!isNaN(newValue)) {
        min = Math.min(min, newValue);
        max = Math.max(max, newValue);
      }
    }

    return min === Infinity || max === -Infinity
      ? null
      : {
          min: min,
          max: max,
          delta: max - min,
        };
  }

  pluckCategoricalStyleMetaFromFeatures(features) {
    if (!this.isCategorical()) {
      return null;
    }

    const fieldName = this.getField().getName();
    const counts = new Map();
    for (let i = 0; i < features.length; i++) {
      const feature = features[i];
      const term = feature.properties[fieldName];
      //properties object may be sparse, so need to check if the field is effectively present
      if (typeof term !== undefined) {
        if (counts.has(term)) {
          counts.set(term, counts.get(term) + 1);
        } else {
          counts.set(term, 1);
        }
      }
    }

    const ordered = [];
    for (const [key, value] of counts) {
      ordered.push({ key, count: value });
    }

    ordered.sort((a, b) => {
      return b.count - a.count;
    });
    const truncated = ordered.slice(0, COLOR_PALETTE_MAX_SIZE);
    return {
      categories: truncated,
    };
  }

  pluckOrdinalStyleMetaFromFieldMetaData(fieldMetaData) {
    if (!this.isOrdinal()) {
      return null;
    }

    const stats = fieldMetaData[this._field.getRootName()];
    if (!stats) {
      return null;
    }

    const sigma = _.get(this.getFieldMetaOptions(), 'sigma', DEFAULT_SIGMA);
    const stdLowerBounds = stats.avg - stats.std_deviation * sigma;
    const stdUpperBounds = stats.avg + stats.std_deviation * sigma;
    const min = Math.max(stats.min, stdLowerBounds);
    const max = Math.min(stats.max, stdUpperBounds);
    return {
      min,
      max,
      delta: max - min,
      isMinOutsideStdRange: stats.min < stdLowerBounds,
      isMaxOutsideStdRange: stats.max > stdUpperBounds,
    };
  }

  pluckCategoricalStyleMetaFromFieldMetaData(fieldMetaData) {
    if (!this.isCategorical()) {
      return null;
    }

    const rootFieldName = this._field.getRootName();
    if (!fieldMetaData[rootFieldName] || !fieldMetaData[rootFieldName].buckets) {
      return null;
    }

    const ordered = fieldMetaData[rootFieldName].buckets.map(bucket => {
      return {
        key: bucket.key,
        count: bucket.doc_count,
      };
    });
    return {
      categories: ordered,
    };
  }

  formatField(value) {
    if (this.getField()) {
      const fieldName = this.getField().getName();
      const fieldFormatter = this._getFieldFormatter(fieldName);
      return fieldFormatter ? fieldFormatter(value) : value;
    } else {
      return value;
    }
  }

  getMbValue(value) {
    if (!this.isOrdinal()) {
      return this.formatField(value);
    }

    const valueAsFloat = parseFloat(value);
    if (this.isOrdinalScaled()) {
      return scaleValue(valueAsFloat, this.getRangeFieldMeta());
    }
    if (isNaN(valueAsFloat)) {
      return 0;
    }
    return valueAsFloat;
  }

  renderBreakedLegend() {
    return null;
  }

  _renderCategoricalLegend({ isPointsOnly, isLinesOnly, symbolId }) {
    return (
      <CategoricalLegend
        style={this}
        isPointsOnly={isPointsOnly}
        isLinesOnly={isLinesOnly}
        symbolId={symbolId}
      />
    );
  }

  _renderRangeLegend() {
    return <OrdinalLegend style={this} />;
  }

  renderLegendDetailRow({ isPointsOnly, isLinesOnly, symbolId }) {
    if (this.isOrdinal()) {
      if (this.isOrdinalRanged()) {
        return this._renderRangeLegend();
      } else if (this.hasOrdinalBreaks()) {
        return this._renderCategoricalLegend({ isPointsOnly, isLinesOnly, symbolId });
      } else {
        return null;
      }
    } else if (this.isCategorical()) {
      return this._renderCategoricalLegend({ isPointsOnly, isLinesOnly, symbolId });
    } else {
      return null;
    }
  }

  renderFieldMetaPopover(onFieldMetaOptionsChange) {
    if (!this.isOrdinal() || !this.supportsFieldMeta()) {
      return null;
    }

    return (
      <OrdinalFieldMetaOptionsPopover styleProperty={this} onChange={onFieldMetaOptionsChange} />
    );
  }
}
