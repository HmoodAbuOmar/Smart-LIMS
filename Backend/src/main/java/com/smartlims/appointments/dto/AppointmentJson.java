package com.smartlims.appointments.dto;

import tools.jackson.core.*;
import tools.jackson.databind.*;

public final class AppointmentJson {
    private AppointmentJson() {
    }

    public static class Text extends ValueDeserializer<String> {
        @Override
        public String deserialize(JsonParser p, DeserializationContext c) {
            return p.hasToken(JsonToken.VALUE_STRING) ? p.getString() : (String) c.handleUnexpectedToken(String.class, p);
        }
    }

    public static class BooleanValue extends ValueDeserializer<Boolean> {
        @Override
        public Boolean deserialize(JsonParser p, DeserializationContext c) {
            if (p.hasToken(JsonToken.VALUE_TRUE))
                return true;
            if (p.hasToken(JsonToken.VALUE_FALSE))
                return false;
            return (Boolean) c.handleUnexpectedToken(Boolean.class, p);
        }
    }

    public static class IntegerValue extends ValueDeserializer<Integer> {
        @Override
        public Integer deserialize(JsonParser p, DeserializationContext c) {
            return p.hasToken(JsonToken.VALUE_NUMBER_INT) ? p.getIntValue() : (Integer) c.handleUnexpectedToken(Integer.class, p);
        }
    }

    public static class LongValue extends ValueDeserializer<Long> {
        @Override
        public Long deserialize(JsonParser p, DeserializationContext c) {
            return p.hasToken(JsonToken.VALUE_NUMBER_INT) ? p.getLongValue() : (Long) c.handleUnexpectedToken(Long.class, p);
        }
    }
}
